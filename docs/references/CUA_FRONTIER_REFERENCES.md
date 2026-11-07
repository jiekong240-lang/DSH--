# 前沿家用机 / 桌面 CUA 技术资料

> 供下次开发时直接参考的真实技术资料。
> 按与本仓库 CUA 核心（截图、可访问性、动作、任务契约、监督、经验学习）的相关性整理。
>
> 更新时间：2026-11-08（补充前沿论文：OSWorld 2.0、Agent S3、UI-TARS-2、效率与安全）

## 1. 核心论文（必读）

### OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments
- **arXiv**: [2404.07972](https://arxiv.org/abs/2404.07972)
- **要点**: 真实操作系统环境下的桌面任务基准（369 任务）。人类基线约 72%，早期智能体很低。
- **与本仓库关系**: 任务契约、观察→动作→验证闭环的标准定义。Windows 任务可参考其扩展集。

### OSWorld 2.0: Benchmarking Computer Use Agents on Long-Horizon Real-World Tasks
- **arXiv**: [2606.29537](https://arxiv.org/abs/2606.29537)
- **要点**: 108 个长时程真实世界工作流（人类中位约 1.6 小时，平均 300+ 步）。前沿模型二元完成率仍仅 ~20.6%（partial ~55%）。重点考察隐藏状态、跨源推理、动态环境、安全报告。
- **与本仓库关系**: 长任务契约、失败恢复、状态一致性检查、监督闭环的核心参考基准。下次开发优先对齐长时程能力。
- **项目**: https://osworld-v2.xlang.ai / https://github.com/xlang-ai/OSWorld-V2

### Windows Agent Arena: Evaluating Multi-Modal OS Agents at Scale
- **arXiv**: [2409.08264](https://arxiv.org/abs/2409.08264)
- **ICML 2025**
- **要点**: Windows 专用基准（150+ 任务）。Navi 智能体在 Windows 上 19.5% vs 人类 74.5%。可并行评估。
- **与本仓库关系**: 直接对应家用机 Windows 场景。观察（截图）、工具使用、规划能力的评估标准。
- **项目**: https://microsoft.github.io/WindowsAgentArena

### Agent S / Agent S2 / Agent S3
- **Agent S**: [2410.08164](https://arxiv.org/abs/2410.08164) (ICLR 2025)
- **Agent S2**: [2504.00906](https://arxiv.org/abs/2504.00906)
- **Agent S3**: [2510.02250](https://arxiv.org/abs/2510.02250) — *The Unreasonable Effectiveness of Scaling Agents for Computer Use* (TMLR 2026)
- **要点**: 开源 CUA 框架。Agent S3 + Behavior Best-of-N 在 OSWorld 上超过人类基线（~72.6%）。组合式规划 + 简化架构 + 多轨迹选择。强泛化到 WindowsAgentArena。
- **与本仓库关系**: 层次规划、经验增强、失败恢复、多轨迹监督的实现参考。任务契约与 supervisor 可借鉴其 ACI 与 Best-of-N 思路。
- **项目**: https://github.com/simular-ai/Agent-S

### UI-TARS: Pioneering Automated GUI Interaction with Native Agents
- **arXiv**: [2501.12326](https://arxiv.org/abs/2501.12326)
- **要点**: 纯视觉 native GUI agent（仅截图输入）。统一动作空间 + System-2 推理。早期 OSWorld SOTA。
- **UI-TARS-2**: [2509.02544](https://arxiv.org/abs/2509.02544) — 多轮 RL + 数据飞轮 + 混合 GUI/终端/文件系统。OSWorld 47.5%、WindowsAgentArena 50.6%。
- **与本仓库关系**: 截图观察 + 动作接口的端到端参考；本地执行层可对标其动作空间与推理模式。
- **项目**: https://github.com/bytedance/UI-TARS · https://github.com/bytedance/UI-TARS-desktop

### OpenCUA: Open Foundations for Computer-Use Agents
- **arXiv**: [2508.09123](https://arxiv.org/abs/2508.09123)
- **NeurIPS 2025 Spotlight**
- **要点**: 开源数据与基础模型框架。AgentNet 数据集。OpenCUA-72B 在 OSWorld-Verified 上约 45%。
- **与本仓库关系**: 人类演示数据、长思维链、经验学习可参考其数据管线。
- **项目**: https://github.com/xlang-ai/OpenCUA · https://opencua.xlang.ai

### Hybrid Computer Use (HCU): A Unified Programmatic, Semantic, and Visual Interface for General Agents
- **arXiv**: [2610.41432](https://arxiv.org/abs/2610.41432)
- **要点**: 程序化（code/CLI）+ 语义（Accessibility）+ 视觉（GUI）三通道统一接口。在 OSWorld 2.0 上获得高分。支持 AX 差分、批量动作、防陈旧状态。
- **与本仓库关系**: 直接对齐本仓库 observer + accessibility + action 设计。下次可优先增强三通道协同。

## 2. Windows 相关与工程实践

### UFO / UFO2（Microsoft）
- Windows Desktop AgentOS。结合 UI Automation + 视觉。
- Host agent + per-app agents。
- 支持 picture-in-picture 虚拟桌面，不占用用户主屏幕。
- **与本仓库关系**: 可访问性树、窗口管理、安全执行模式。

### Mage-VL-Cowork（Microsoft）
- 4B 混合 GUI + Code CUA。
- OSWorld-Verified 66%（50-step）。
- **与本仓库关系**: 小模型 + 代码执行 + GUI 操作的混合策略，适合本地执行层。

## 3. 安全、验证与失败处理

### What Does "Now" Mean to Your Computer-Use Agent?
- **arXiv**: [2610.39282](https://arxiv.org/abs/2610.39282)
- **要点**: 截图陈旧、页面加载导致点击失效。点击前应做像素对比或状态检查。
- **与本仓库关系**: 监督循环与验证步骤必须考虑状态一致性，避免在旧截图上执行动作。

### Control OSWorld: An AI Control Environment for GUI Computer Use Agents
- **arXiv**: [2610.03818](https://arxiv.org/abs/2610.03818)
- **要点**: 将 OSWorld 任务与有害副任务结合，研究如何监控潜在恶意的 GUI 智能体。强调轨迹级监控与步级监控的差异。
- **与本仓库关系**: 闸门、人工批准通道与 supervisor 审计的安全设计依据。

### OS-Harm / RiOSWorld
- 安全风险基准。敏感操作、提示注入、误用风险。
- **与本仓库关系**: 闸门与人工批准通道的设计依据。

## 4. 效率与数据

### OSWorld-Human: Benchmarking the Efficiency of Computer-Use Agents
- **arXiv**: [2506.16042](https://arxiv.org/abs/2506.16042)
- **要点**: 首次系统研究 CUA 时间效率。即使高分智能体也比人类多花 1.4–2.7× 步骤。规划/反思占主导延迟。
- **与本仓库关系**: 任务契约与 supervisor 应优先考虑步骤效率与早停，避免无限循环。

### AgentNet（OpenCUA 部分）
- 大规模人类计算机使用演示数据集（3 OS、200+ 应用）。
- **与本仓库关系**: 经验学习模块可参考其轨迹收集与反思链。

### GroundCUA
- 人类演示的桌面 grounding 数据集。
- **与本仓库关系**: UI 元素定位与可访问性树的补充。

## 5. 开源实现与工具（工程参考）

| 项目 | 说明 | 链接 |
|------|------|------|
| WindowsAgentArena | Windows 基准与环境 | https://github.com/microsoft/WindowsAgentArena |
| OpenCUA | 开源 CUA 框架与模型 | https://github.com/xlang-ai/OpenCUA |
| Agent-S (S3) | 开源 CUA 框架（超人类 OSWorld） | https://github.com/simular-ai/Agent-S |
| UI-TARS / UI-TARS-desktop | Native GUI agent + 桌面应用 | https://github.com/bytedance/UI-TARS-desktop |
| UFO | Microsoft Windows Desktop Agent | 搜索 Microsoft UFO |
| awesome-computer-use | 论文/工具汇总 | https://github.com/ranpox/awesome-computer-use |

## 6. 对本仓库下一步开发的建议映射

| 本仓库模块 | 建议参考 |
|------------|----------|
| observer（截图） | OSWorld / WindowsAgentArena 观察协议；截图陈旧检测（2610.39282）；HCU 视觉通道 |
| accessibility | UFO / HCU 的 AX 通道；GroundCUA；HCU AX 差分与批量 |
| action（SendInput） | 各基准中的低层动作空间定义；UI-TARS 统一动作空间；安全闸门设计 |
| task + 失败恢复 | Agent S2/S3 的层次规划；OSWorld 2.0 长时程任务结构；Behavior Best-of-N |
| supervisor / 人工批准 | OS-Harm / Control OSWorld 安全思考；点击前验证；状态一致性 |
| experience 学习 | OpenCUA / AgentNet 轨迹收集与反思；Agent S 经验增强层次规划 |
| 效率 | OSWorld-Human；避免过多规划/反思导致延迟 |

---

**使用方式**：下次开发前先读本文件对应条目，再决定要补充哪一块能力。论文链接直接点击即可获取原文。

**优先阅读顺序建议**（对家用机 Windows CUA）：
1. OSWorld 2.0 + Windows Agent Arena
2. Agent S3 + HCU
3. UI-TARS-2 + OpenCUA
4. OSWorld-Human + Control OSWorld（效率与安全）
