# CUDA 加速层（贴合本地硬件）

针对 RTX 5070 笔记本等移动端 GPU 做了自适应：

- 自动查询设备名称、显存、计算能力
- 根据可用显存动态限制粒子规模（默认上限约 3.2 万）
- 大规模排斥自动采样，避免 N² 爆显存
- 无 CUDA 时回退 NumPy

## 依赖

```bash
pip install -r cuda/requirements.txt
```

## 模式

- `info`：查询当前 GPU 硬件信息
- `generate`：参数化塔 / 球体（自动截断规模）
- `section`：截面点云
- `step`：粒子更新（目标吸引 + 阻尼 + 可选排斥）

## Node 接口

- `POST /api/cuda/info`
- `POST /api/cuda/generate`
- `POST /api/cuda/section`
- `POST /api/cuda/step`

返回结果中会带 `device` 字段，方便确认实际用的硬件。
