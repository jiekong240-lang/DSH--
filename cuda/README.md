# CUDA 加速层

工业级建模重计算（粒子相互作用、高精度点云、几何）在本地 GPU 上执行。

## 依赖

```bash
pip install -r cuda/requirements.txt
```

需要 NVIDIA 驱动 + CUDA Toolkit（RTX 5070 笔记本已满足）。

## 用法

Node 服务会自动调用 `python cuda/particle_sim.py`。

无 CUDA / CuPy 时自动回退到 NumPy，不影响运行。

## 当前能力

- `generate`：GPU 生成塔/球体点云
- `step`：GPU 粒子位置更新（目标吸引 + 阻尼）

后续可扩展：粒子碰撞、布尔运算、参数化网格。
