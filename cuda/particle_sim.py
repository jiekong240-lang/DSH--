#!/usr/bin/env python3
"""
CUDA 粒子仿真模块
使用 CuPy 在 GPU 上执行粒子位置更新与目标吸引。
无 CUDA 或 CuPy 时自动回退到 NumPy。
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


def simulate_step(positions, velocities, targets, boost, damping, settle_damping, dt):
    """单步粒子更新（GPU 优先）"""
    n = positions.shape[0]
    if targets is not None and targets.shape[0] > 0:
        # 简单最近邻目标分配（可扩展为更好的分配策略）
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

    damp = cp.where(dist < 0.35, settle_damping, damping)
    velocities *= damp[:, None]

    positions += velocities * dt

    # 边界
    velocities[:, 0] = cp.where((positions[:, 0] < -8) | (positions[:, 0] > 8), velocities[:, 0] * -0.5, velocities[:, 0])
    velocities[:, 1] = cp.where((positions[:, 1] < -6) | (positions[:, 1] > 6), velocities[:, 1] * -0.5, velocities[:, 1])

    return positions, velocities


def generate_tower(n=2000):
    t = cp.linspace(0, 1, n)
    height = (t - 0.5) * 7.2
    taper = 1.0 - t * 0.72
    angle = t * cp.pi * 18
    r = (0.35 + cp.random.rand(n) * 0.45) * taper
    pts = cp.stack([
        cp.cos(angle) * r,
        height,
        cp.sin(angle) * r * 0.6
    ], axis=1)
    return pts


def generate_sphere(n=1800):
    phi = cp.arccos(2 * cp.random.rand(n) - 1)
    theta = cp.random.rand(n) * 2 * cp.pi
    r = 2.4 + (cp.random.rand(n) - 0.5) * 0.3
    pts = cp.stack([
        r * cp.sin(phi) * cp.cos(theta),
        r * cp.sin(phi) * cp.sin(theta) * 0.85,
        r * cp.cos(phi)
    ], axis=1)
    return pts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["step", "generate"], required=True)
    parser.add_argument("--shape", default="tower")
    parser.add_argument("--n", type=int, default=12000)
    parser.add_argument("--steps", type=int, default=1)
    args = parser.parse_args()

    if args.mode == "generate":
        if args.shape == "tower":
            pts = generate_tower(args.n)
        else:
            pts = generate_sphere(args.n)
        out = pts.get() if HAS_CUDA else pts
        print(json.dumps({"ok": True, "cuda": HAS_CUDA, "points": out.tolist()}))
        return

    # step mode: 从 stdin 读入状态，执行一步
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

    for _ in range(args.steps):
        positions, velocities = simulate_step(positions, velocities, targets, boost, damping, settle, dt)

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
