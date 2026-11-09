# 文献总表（INDEX）

> 按「干活缺口」归类。详细模块映射见 [`../references/CUA_FRONTIER_REFERENCES.md`](../references/CUA_FRONTIER_REFERENCES.md)。  
> 更新：2026-11-09（UTC+8）

## 完成率 / 评测尺子

| 标题 | 链接 | 作用 |
|------|------|------|
| OSWorld | https://arxiv.org/abs/2404.07972 | 真实 OS 开放任务基准；定义观察→动作→验证 |
| OSWorld 2.0 | https://arxiv.org/abs/2606.29537 | 长时程工作流完成率；对齐续跑与失败恢复 |
| Windows Agent Arena | https://arxiv.org/abs/2409.08264 | Windows 多模态 OS agent；家用机场景尺子 |
| OSWorld-Human | https://arxiv.org/abs/2506.16042 | CUA **效率**（步数/时间）；早停与少空转 |
| ScaleCUA | https://arxiv.org/abs/2509.15221 | 跨平台开源 CUA 数据缩放；OSWorld-G / WindowsArena 完成率基线 |

## 长程 / 续跑 / 规划

| 标题 | 链接 | 作用 |
|------|------|------|
| Agent S / S2 / S3 | https://arxiv.org/abs/2410.08164 · https://arxiv.org/abs/2504.00906 · https://arxiv.org/abs/2510.02250 | 层次规划、经验增强、多轨迹；续跑与 supervisor 参考 |
| UI-TARS / UI-TARS-2 | https://arxiv.org/abs/2501.12326 · https://arxiv.org/abs/2509.02544 | 纯视觉 native GUI；统一动作空间与多轮 RL |
| OpenCUA | https://arxiv.org/abs/2508.09123 | 开源数据与基础模型；经验学习管线 |
| Hybrid Computer Use (HCU) | https://arxiv.org/abs/2610.41432 | 程序化+语义 AX+视觉三通道；对齐 observer/accessibility/action |
| Surfer 2 | https://arxiv.org/abs/2510.19949 | 规划/执行/验证解耦 + 自恢复；跨端完成率 |
| GUI-PRA | https://arxiv.org/abs/2509.23263 | 过程奖励 + 动态记忆；抬升长程 GUI 成功率 |
| AgentRewind | https://arxiv.org/abs/2608.14380 | 上下文+环境对齐检查点回退；resume-task 状态机蓝图 |
| SPROUT | https://arxiv.org/abs/2610.14405 | 文件系统与上下文快照分支；仓库级编码续跑 |

## 记忆 / 状态携带

| 标题 | 链接 | 作用 |
|------|------|------|
| EchoPath | https://arxiv.org/abs/2609.16635 | 经验证轨迹→可调用重放记忆；跨会话少再推理 |

## 成本约束级联路由

| 标题 | 链接 | 作用 |
|------|------|------|
| AgentRouter | https://arxiv.org/abs/2609.22951 | 轨迹步级异构路由；大幅降本且保任务质量 |
| xRouter | https://arxiv.org/abs/2510.08439 | 成功才给奖的成本感知 RL 编排 |

## 状态一致性 / 真绿 / 最小安全

| 标题 | 链接 | 作用 |
|------|------|------|
| What Does "Now" Mean… | https://arxiv.org/abs/2610.39282 | 截图陈旧导致假操作；监督前状态检查 |
| Control OSWorld | https://arxiv.org/abs/2610.03818 | 轨迹级监控；闸门只挡危险、不挡主路径的设计参考 |
| Who Verifies the Agent's Success Claim? | https://arxiv.org/abs/2610.29609 | 报告隔离 + 轨迹审计；反危险误报/假绿 |

## Windows / 进程编排

| 标题 | 链接 | 作用 |
|------|------|------|
| UFO2: The Desktop AgentOS | https://arxiv.org/abs/2504.14603 | Windows RDP 环回会话隔离与 Host/App 编排 |

## 工程实现（非论文）

| 项目 | 链接 | 作用 |
|------|------|------|
| Agent-S | https://github.com/simular-ai/Agent-S | 开源 CUA 框架（OSWorld 强） |
| OpenCUA | https://github.com/xlang-ai/OpenCUA | 开源 CUA + AgentNet |
| UI-TARS-desktop | https://github.com/bytedance/UI-TARS-desktop | 桌面端 native GUI |
| WindowsAgentArena | https://github.com/microsoft/WindowsAgentArena | Windows 基准与环境 |
| awesome-computer-use | https://github.com/ranpox/awesome-computer-use | 论文/工具汇总入口 |

## 批次日志

| 批次 | 说明 |
|------|------|
| [2026-11-08](batches/2026-11-08.md) | 首批落盘：从既有 `CUA_FRONTIER_REFERENCES` 迁入总表 + 目录 README；对齐「真能干活」主题 |
| [2026-11-09](batches/2026-11-09.md) | 双日检索新增 10 篇：完成率、检查点续跑、成本路由、声称审计、GUI 记忆、Windows AgentOS |
