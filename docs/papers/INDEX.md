# 文献总表（INDEX）

> 按「干活缺口」归类。详细模块映射见 [`../references/CUA_FRONTIER_REFERENCES.md`](../references/CUA_FRONTIER_REFERENCES.md)。  
> 更新：2026-11-17（UTC+8）

## 完成率 / 评测尺子

| 标题 | 链接 | 作用 |
|------|------|------|
| OSWorld | https://arxiv.org/abs/2404.07972 | 真实 OS 开放任务基准；定义观察→动作→验证 |
| OSWorld 2.0 | https://arxiv.org/abs/2606.29537 | 长时程工作流完成率；对齐续跑与失败恢复 |
| Windows Agent Arena | https://arxiv.org/abs/2409.08264 | Windows 多模态 OS agent；家用机场景尺子 |
| OSWorld-Human | https://arxiv.org/abs/2506.16042 | CUA **效率**（步数/时间）；早停与少空转 |
| ScaleCUA | https://arxiv.org/abs/2509.15221 | 跨平台开源 CUA 数据缩放；OSWorld-G / WindowsArena 完成率基线 |
| NorthCUA | https://arxiv.org/abs/2611.02102 | 经验飞轮 + 已验证里程碑续跑；开源桌面/Web 完成率新标尺 |
| CUA-Master | https://arxiv.org/abs/2611.03126 | OSWorld Verified 80.2 / OSWorld 2.0 36.9；快照回滚重试采集 |
| WindowsWorld | https://arxiv.org/abs/2604.27776 | Windows 跨应用专业工作流（181 题，78% 跨应用）；跨应用完成率 <21%，早期子目标易卡住 |

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
| CUA-Recovery | https://arxiv.org/abs/2610.27645 | 真实策略错误态上的恢复评测；先察觉再从脏状态做完 |
| Switch-SWE | https://arxiv.org/abs/2611.02017 | 同一仓库交错未完成任务后的焦点续跑；编码 agent 切换掉点 |
| ScienceCUA | https://arxiv.org/abs/2611.03238 | 文档→可执行 Skills/References，失败轨迹验证后才入库；专用软件 bootstrap |
| Repeating Work Can Lower Energy per Successful Goal | https://arxiv.org/abs/2611.10315 | 用 EpG 选恢复：早失败重启、晚失败续跑，能回状态时只回滚被打断的一轮 |
| Folio | https://arxiv.org/abs/2611.16627 | 运行时多分辨率折叠加句柄恢复；替代模型摘要压缩，保住工具证据并可续跑 |
| Keeping LLM Agents on Procedure | https://arxiv.org/abs/2611.10884 | 可执行 FSM 把 SOP 状态放在运行时；重述或 resume 修不了漂移 |
| OS-Wizard | https://arxiv.org/abs/2610.33907 | 教程+GUI–Code+关键态快照分叉采集；ScienceBoard 5.9%→64.1%，亦利一般桌面任务 |
| HerAgent | https://arxiv.org/abs/2611.18443 | 环境搭建用语义块级检查点回滚；Installamatic-Bench 52%→85%，SetupBench 46.3%→70.4% |
| Co-Sight Harness | https://arxiv.org/abs/2611.17696 | 外置状态机+可机检验收门；已部署超 200 步工作流无人值守完成率 50%→100% |
| Actor, Judge, or Teacher? | https://arxiv.org/abs/2611.17167 | 差的 actor 仍可当轨迹教师；JEV 把 1.5B 策略 ALFWorld 72.8%→82.9%、WebShop 56.8%→71.4% |
| ToolCUA | https://arxiv.org/abs/2605.12481 | 学习 GUI 与工具切换的更短路径；OSWorld-MCP 46.85%，相对基线约 +66% |

## 记忆 / 状态携带

| 标题 | 链接 | 作用 |
|------|------|------|
| EchoPath | https://arxiv.org/abs/2609.16635 | 经验证轨迹→可调用重放记忆；跨会话少再推理 |
| MemU-Bench | https://arxiv.org/abs/2611.00191 | 依赖历史的模糊任务尺子；用 SPL 揭穿穷搜假绿，AppMem 结构化召回 |
| TAM（Task Advancement Memory） | https://arxiv.org/abs/2610.37482 | 以已验证进展为状态；跨应用累积成果并抽象可复用操作 |
| FGSE（When Should Agents Remember?） | https://arxiv.org/abs/2611.14326 | 经验先当假说，经迁移/证伪/回归探针通过才写入持久记忆 |
| When Should LLM Agents Forget? | https://arxiv.org/abs/2611.17338 | 解析器不可靠时不要硬删；误删伤害大于误留，默认无标签保留 |
| Can Agents Keep Up with Time? | https://arxiv.org/abs/2611.17806 | 会话再唤起须把当前时间用进计划；能读时钟仍按过期安排办事等于状态没带上 |

## 成本约束级联路由

| 标题 | 链接 | 作用 |
|------|------|------|
| AgentRouter | https://arxiv.org/abs/2609.22951 | 轨迹步级异构路由；大幅降本且保任务质量 |
| xRouter | https://arxiv.org/abs/2510.08439 | 成功才给奖的成本感知 RL 编排 |
| LEASH | https://arxiv.org/abs/2610.22280 | CUA 免训练弱→强升级；小模型默认干、不确定再交强模型 |
| Visual Token Routing (VTR) | https://arxiv.org/abs/2611.06854 | 长程截图只保留对下一步有用的视觉 token；降本且对齐全分辨率完成率 |
| GroundCascade | https://arxiv.org/abs/2611.13177 | 全屏与放大一致走快路径，不一致才请第二意见；少调用强模型抬升 GUI grounding |
| CARE-PO | https://arxiv.org/abs/2611.12125 | 按任务难度固定调用预算锚点；一次训练给出效率/能力工作点，避免零工具坍缩 |

## 状态一致性 / 真绿 / 最小安全

| 标题 | 链接 | 作用 |
|------|------|------|
| What Does "Now" Mean… | https://arxiv.org/abs/2610.39282 | 截图陈旧导致假操作；监督前状态检查 |
| Control OSWorld | https://arxiv.org/abs/2610.03818 | 轨迹级监控；闸门只挡危险、不挡主路径的设计参考 |
| Who Verifies the Agent's Success Claim? | https://arxiv.org/abs/2610.29609 | 报告隔离 + 轨迹审计；反危险误报/假绿 |
| Probe-and-Resume | https://arxiv.org/abs/2610.21088 | 完成声称在 fork 上探测证实；拒绝则原状态续跑 |
| VeriCUA（agentic exploration） | https://arxiv.org/abs/2610.40578 | 主动 GUI/代码取证验证完成；跨端拒绝假完成声称 |
| Coati | https://arxiv.org/abs/2611.02644 | 宿主证据审计完成声称（不足则 unverified）；只记已验证的按应用记忆 |
| Same Error, Different Recovery | https://arxiv.org/abs/2611.11581 | 工具错误的投递方式改变恢复行为；保留失败交换并分类指导，减少空转与假做成 |
| AgentHorizon | https://arxiv.org/abs/2610.11050 | 长程跨系统 CUA 法官基准；配对负例检验能否拒绝「做的是另一件事」的假绿 |
| Verification Transport | https://arxiv.org/abs/2611.18471 | 轨迹经压缩/委派后法官判决会漂；传输失败约 31%，还原出处可挽回 85.5% |

## Windows / 进程编排

| 标题 | 链接 | 作用 |
|------|------|------|
| UFO2: The Desktop AgentOS | https://arxiv.org/abs/2504.14603 | Windows RDP 环回会话隔离与 Host/App 编排 |
| WindowsWorld | https://arxiv.org/abs/2604.27776 | 专业跨应用 Windows 工作流尺子；跨应用 <21%，≥3 个应用的条件推理易在早期停住 |

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
| [2026-11-11](batches/2026-11-11.md) | 双日检索新增 9 篇：开源完成率新标尺、快照回滚、记忆评测、声称探测续跑、失败恢复、仓库任务切换、弱→强成本升级 |
| [2026-11-13](batches/2026-11-13.md) | 双日检索新增 5 篇：宿主证据反假绿、长程视觉 token 降本、文档→技能演化 bootstrap、按 EpG 选择失败恢复、错误投递与自我纠错 |
| [2026-11-15](batches/2026-11-15.md) | 双日检索新增 7 篇：可恢复上下文折叠、证伪门控记忆、GUI 级联定位、SOP 运行时 FSM、专用软件教程+快照 bootstrap、可控工具调用效率、长程 CUA 法官评测 |
| [2026-11-17](batches/2026-11-17.md) | 双日检索新增 8 篇：验证判决跨抽象传输、块级环境搭建检查点、外置 SOP 验收门、会话再唤起时间状态、记忆遗忘门控、轨迹教师、Windows 跨应用尺子、GUI–工具路径编排 |
