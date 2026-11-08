# 粒子 CUDA 运行依赖

仅仓库标记，本地按需安装。

## 必要
- Python 3.x
- 见 `cuda/requirements.txt`

## CUDA 加速（可选，优先）
- CuPy（与本地 CUDA Toolkit 匹配的版本）
- NVIDIA GPU + 驱动
- 无 CuPy 时自动回退 NumPy

## 前端
- Three.js（已在 public/lib/）
- WebGL（浏览器端渲染）

## 接口
- `python cuda/particle_sim.py --mode info` → 查询设备
- Node 端点：`/api/cuda/*`（见 cuda/README.md）

## 原则
- CUDA 优先，失败回退
- 显存自适应，不强制大规模
- 仓库变更不修改本地 CUDA 环境
