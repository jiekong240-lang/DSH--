# CUDA 加速层（工业级建模）

本地 GPU 执行重计算：粒子相互作用、参数化几何、高精度点云。

## 依赖

```bash
pip install -r cuda/requirements.txt
```

需要 NVIDIA 驱动 + CUDA Toolkit。RTX 5070 笔记本已满足。

## 模式

- `generate`：参数化塔 / 球体点云
- `section`：截面点云（xy/xz/yz）
- `step`：粒子更新（目标吸引 + 阻尼 + 粒子排斥堆积）

无 CUDA 时自动回退 NumPy。

## Node 接口

- `POST /api/cuda/generate`  `{shape, n}`
- `POST /api/cuda/section`   `{shape, plane, offset, n}`
- `POST /api/cuda/step`      状态 JSON
