#!/usr/bin/env python3
"""
CUDA 粒子仿真 + 几何生成模块
GPU 优先：粒子相互作用、参数化建模、高精度点云。
无 CUDA / CuPy 时自动回退到 NumPy。
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


def particle_repulsion(positions, radii=0.045, strength=0.12):
    """粒子间短距离排斥（堆积感），只处理邻近粒子以控制开销"""
    n = positions.shape[0]
    if n > 8000:
        # 大规模时用采样减少计算量
        sample = cp.random.choice(n, size=min(4000, n), replace=False)
        pos = positions[sample]
    else:
        pos = positions

    # 简单的广播距离（对中等规模可接受）
    diff = pos[:, None, :] - pos[None, :, :]
    dist = cp.sqrt(cp.sum(diff * diff, axis=2)) + 1e-6
    mask = (dist < radii * 2.2) & (dist > 1e-4)
    force_mag = strength * (radii * 2.0 - dist) / (dist + 1e-4)
    force_mag = cp.where(mask, force_mag, 0.0)
    forces = cp.sum(force_mag[:, :, None] * diff / dist[:, :, None], axis=1)

    if n > 8000:
        out = cp.zeros_like(positions)
        out[sample] = forces
        return out
    return forces


def simulate_step(positions, velocities, targets, boost, damping, settle_damping, dt, repulsion=True):
    """单步粒子更新：目标吸引 + 阻尼 + 粒子排斥"""
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
    """参数化塔：分层收分、可控比例"""
    pts = []
    per_layer = max(40, n // layers)
    for li in range(layers):
        t = li / (layers - 1)
        height = (t - 0.5) * 7.4
        taper = 1.0 - t * 0.68
        r_base = 0.42 * taper
        for i in range(per_layer):
            ang = (i / per_layer) * 2 * cp.pi + t * 1.2
            rr = r_base * (0.65 + 0.35 * cp.random.rand())
            pts.append([cp.cos(ang) * rr, height, cp.sin(ang) * rr * 0.62])
    pts = cp.asarray(pts, dtype=cp.float32)
    if pts.shape[0] > n:
        pts = pts[:n]
    return pts


def generate_sphere(n=2000):
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
    """生成截面点云（简单平面切片）"""
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
    parser.add_argument("--mode", choices=["step", "generate", "section"], required=True)
    parser.add_argument("--shape", default="tower")
    parser.add_argument("--n", type=int, default=12000)
    parser.add_argument("--steps", type=int, default=1)
    parser.add_argument("--plane", default="xy")
    parser.add_argument("--offset", type=float, default=0.0)
    args = parser.parse_args()

    if args.mode == "generate":
        if args.shape == "tower":
            pts = generate_tower(args.n)
        else:
            pts = generate_sphere(args.n)
        out = pts.get() if HAS_CUDA else pts
        print(json.dumps({"ok": True, "cuda": HAS_CUDA, "points": out.tolist(), "count": int(pts.shape[0])}))
        return

    if args.mode == "section":
        pts = generate_section(args.shape, args.plane, args.offset, args.n)
        out = pts.get() if HAS_CUDA else pts
        print(json.dumps({"ok": True, "cuda": HAS_CUDA, "points": out.tolist(), "count": int(pts.shape[0])}))
        return

    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    positions = cp.asarray(data.get("positions", []), dtype=cp.float32)
    velocities = cp.asarray(data.get("velocities", []), dtype=cp.float32)
    targets = cp.asarray(data.get("targets", []), dtype=cp.float32) if data.get("targets") else None

    if positions.size == 0:
        print(json.dumps({"ok": False, "error": "no positions"}))
        return

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
        "positions": pos_out.tolist(),
        "velocities": vel_out.tolist()
    }))


if __name__ == "__main__":
    main()
