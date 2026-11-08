#!/usr/bin/env python3
"""
CUDA 粒子仿真 + 几何生成（贴合本地硬件）

针对 RTX 5070 笔记本等移动端 GPU 优化：
- 自动检测设备名称、显存、计算能力
- 根据可用显存动态限制粒子规模
- 大规模时自动降级排斥算法（避免 N²爆显存）
- 无 CUDA / CuPy 时回退到 NumPy
"""
import sys
import json
import argparse

try:
    import cupy as cp
    HAS_CUDA = True
except ImportError:
    import numpy as cp
    HAS_CUDA = False

# 硬件约束（针对笔记本 8GB 级显存做保守估算）
SAFE_PARTICLE_CAP = 32000
REPULSION_FULL_LIMIT = 6000
REPULSION_SAMPLE_LIMIT = 12000


def get_device_info():
    """查询当前 GPU 硬件信息，供上层决策"""
    if not HAS_CUDA:
        return {
            "cuda": False,
            "name": "CPU (NumPy fallback)",
            "vram_total_mb": 0,
            "vram_free_mb": 0,
            "compute_capability": None,
        }
    try:
        dev = cp.cuda.Device(0)
        props = cp.cuda.runtime.getDeviceProperties(0)
        free, total = cp.cuda.runtime.memGetInfo()
        return {
            "cuda": True,
            "name": props["name"].decode() if isinstance(props["name"], bytes) else str(props["name"]),
            "vram_total_mb": int(total // (1024 * 1024)),
            "vram_free_mb": int(free // (1024 * 1024)),
            "compute_capability": f"{props['major']}.{props['minor']}",
            "multi_processor_count": int(props["multiProcessorCount"]),
        }
    except Exception as e:
        return {"cuda": True, "name": "unknown", "error": str(e), "vram_total_mb": 0, "vram_free_mb": 0}


def adaptive_cap(requested_n: int) -> int:
    """根据可用显存调整粒子上限（笔记本保守）"""
    info = get_device_info()
    free_mb = info.get("vram_free_mb", 0)
    # 每粒子约 48 字节（pos+vel+temp），留 1.5GB 给系统和渲染
    if free_mb > 2000:
        soft_cap = min(SAFE_PARTICLE_CAP, int((free_mb - 1500) * 1024 * 1024 / 64))
    else:
        soft_cap = 8000
    return max(100, min(requested_n, soft_cap, SAFE_PARTICLE_CAP))


def particle_repulsion(positions, radii=0.045, strength=0.12):
    """粒子间短距离排斥。大规模时自动采样，避免笔记本显存爆掉。"""
    n = positions.shape[0]
    if n > REPULSION_SAMPLE_LIMIT:
        sample = cp.random.choice(n, size=REPULSION_FULL_LIMIT, replace=False)
        pos = positions[sample]
    elif n > REPULSION_FULL_LIMIT:
        sample = cp.random.choice(n, size=min(n, REPULSION_FULL_LIMIT), replace=False)
        pos = positions[sample]
    else:
        sample = None
        pos = positions

    diff = pos[:, None, :] - pos[None, :, :]
    dist = cp.sqrt(cp.sum(diff * diff, axis=2)) + 1e-6
    mask = (dist < radii * 2.2) & (dist > 1e-4)
    force_mag = strength * (radii * 2.0 - dist) / (dist + 1e-4)
    force_mag = cp.where(mask, force_mag, 0.0)
    forces = cp.sum(force_mag[:, :, None] * diff / dist[:, :, None], axis=1)

    if sample is not None:
        out = cp.zeros_like(positions)
        out[sample] = forces
        return out
    return forces


def simulate_step(positions, velocities, targets, boost, damping, settle_damping, dt, repulsion=True):
    """单步粒子更新：目标吸引 + 阻尼 + 可选排斥"""
    n = positions.shape[0]
    if targets is not None and targets.shape[0] > 0:
        idx = cp.random.randint(0, targets.shape[0], size=n)
        tx = targets[idx, 0]
        ty = targets[idx, 1]
        tz = targets[idx, 2]
    else:
        tx = cp.zeros(n)
        ty = cp.full(n, 0.2)
        tz = cp.zeros(n)

    dx = tx - positions[:, 0]
    dy = ty - positions[:, 1]
    dz = tz - positions[:, 2]
    dist = cp.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
    force = boost * (1.0 - cp.minimum(1.0, dist / 7.0))

    velocities[:, 0] += (dx / dist) * force
    velocities[:, 1] += (dy / dist) * force
    velocities[:, 2] += (dz / dist) * force * 0.55

    if repulsion:
        rep = particle_repulsion(positions)
        velocities += rep * dt

    damp = cp.where(dist < 0.35, settle_damping, damping)
    velocities *= damp[:, None]

    positions += velocities * dt

    velocities[:, 0] = cp.where((positions[:, 0] < -8) | (positions[:, 0] > 8), velocities[:, 0] * -0.5, velocities[:, 0])
    velocities[:, 1] = cp.where((positions[:, 1] < -6) | (positions[:, 1] > 6), velocities[:, 1] * -0.5, velocities[:, 1])

    return positions, velocities


def generate_tower(n=2400, layers=12):
    """参数化塔：分层收分"""
    n = adaptive_cap(n)
    pts = []
    per_layer = max(40, n // layers)
    for li in range(layers):
        t = li / max(1, layers - 1)
        height = (t - 0.5) * 7.4
        taper = 1.0 - t * 0.68
        r_base = 0.42 * taper
        for i in range(per_layer):
            ang = (i / per_layer) * 2 * cp.pi + t * 1.2
            rr = r_base * (0.65 + 0.35 * float(cp.random.rand()))
            pts.append([float(cp.cos(ang) * rr), height, float(cp.sin(ang) * rr * 0.62)])
    pts = cp.asarray(pts, dtype=cp.float32)
    if pts.shape[0] > n:
        pts = pts[:n]
    return pts


def generate_sphere(n=2000):
    n = adaptive_cap(n)
    phi = cp.arccos(2 * cp.random.rand(n) - 1)
    theta = cp.random.rand(n) * 2 * cp.pi
    r = 2.35 + (cp.random.rand(n) - 0.5) * 0.25
    pts = cp.stack([
        r * cp.sin(phi) * cp.cos(theta),
        r * cp.sin(phi) * cp.sin(theta) * 0.88,
        r * cp.cos(phi)
    ], axis=1)
    return pts


def generate_section(shape="tower", plane="xy", offset=0.0, n=800):
    n = adaptive_cap(n)
    if shape == "tower":
        full = generate_tower(n * 3)
    else:
        full = generate_sphere(n * 3)
    if plane == "xy":
        mask = cp.abs(full[:, 2] - offset) < 0.25
    elif plane == "xz":
        mask = cp.abs(full[:, 1] - offset) < 0.25
    else:
        mask = cp.abs(full[:, 0] - offset) < 0.25
    pts = full[mask]
    if pts.shape[0] > n:
        pts = pts[:n]
    return pts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["step", "generate", "section", "info"], required=True)
    parser.add_argument("--shape", default="tower")
    parser.add_argument("--n", type=int, default=12000)
    parser.add_argument("--steps", type=int, default=1)
    parser.add_argument("--plane", default="xy")
    parser.add_argument("--offset", type=float, default=0.0)
    args = parser.parse_args()

    if args.mode == "info":
        info = get_device_info()
        info["ok"] = True
        info["adaptive_cap"] = adaptive_cap(args.n)
        print(json.dumps(info))
        return

    if args.mode == "generate":
        if args.shape == "tower":
            pts = generate_tower(args.n)
        else:
            pts = generate_sphere(args.n)
        out = pts.get() if HAS_CUDA else pts
        print(json.dumps({
            "ok": True,
            "cuda": HAS_CUDA,
            "device": get_device_info(),
            "points": out.tolist(),
            "count": int(pts.shape[0]),
            "requested": args.n,
            "capped": adaptive_cap(args.n),
        }))
        return

    if args.mode == "section":
        pts = generate_section(args.shape, args.plane, args.offset, args.n)
        out = pts.get() if HAS_CUDA else pts
        print(json.dumps({
            "ok": True,
            "cuda": HAS_CUDA,
            "device": get_device_info(),
            "points": out.tolist(),
            "count": int(pts.shape[0]),
        }))
        return

    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    positions = cp.asarray(data.get("positions", []), dtype=cp.float32)
    velocities = cp.asarray(data.get("velocities", []), dtype=cp.float32)
    targets = cp.asarray(data.get("targets", []), dtype=cp.float32) if data.get("targets") else None

    if positions.size == 0:
        print(json.dumps({"ok": False, "error": "no positions"}))
        return

    # 硬件自适应：超过安全上限时截断
    n = positions.shape[0]
    cap = adaptive_cap(n)
    if n > cap:
        positions = positions[:cap]
        velocities = velocities[:cap]
        if targets is not None:
            targets = targets[:cap]

    boost = float(data.get("boost", 0.02))
    damping = float(data.get("damping", 0.97))
    settle = float(data.get("settle_damping", 0.88))
    dt = float(data.get("dt", 0.016))
    repulsion = bool(data.get("repulsion", True))

    for _ in range(args.steps):
        positions, velocities = simulate_step(
            positions, velocities, targets, boost, damping, settle, dt, repulsion
        )

    pos_out = positions.get() if HAS_CUDA else positions
    vel_out = velocities.get() if HAS_CUDA else velocities
    print(json.dumps({
        "ok": True,
        "cuda": HAS_CUDA,
        "device": get_device_info(),
        "positions": pos_out.tolist(),
        "velocities": vel_out.tolist(),
        "used_n": int(positions.shape[0]),
    }))


if __name__ == "__main__":
    main()
