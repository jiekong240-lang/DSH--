# 前沿家用机 / 桌面 CUA 技术资料

> 供下次开发时直接参考的真实技术资料。
> 按与本仓库 CUA 核心（截图、可访问性、动作、任务契约、监督、经验学习）的相关性整理。
>
> 更新时间：2026-11-08

## 1. 核心论文（必读）

### OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments
- **arXiv**: [2404.07972](https://arxiv.org/abs/2404.07972)
- **要点**: 真实操作系统环境下的桌面任务基准（369 任务）。人类基线约 72%，早期智能体很低。
- **与本仓库关系**: 任务契约、观察→动作→验证闭环的标准定义。Windows 任务可参考其扩展集。

### Windows Agent Arena: Evaluating Multi-Modal OS Agents at Scale
- **arXiv**: [2409.08264](https://arxiv.org/abs/2409.08264)
- **ICML 2025**
- **要点**: Windows 专用基准（150+ 任务）。Navi 智能体在 Windows 上 19.5% vs 人类 74.5%。可并行评估。
- **与本仓库关系**: 直接对应家用机 Windows 场景。观察（截图）、工具使用、规划能力的评估标准。
- **项目**: https://microsoft.github.io/WindowsAgentArena

### GUI Agents: A Survey
- **arXiv**: [2412.13501](https://arxiv.org/abs/2412.13501)
- **Findings of ACL 2025**
- **要点**: GUI 智能体综述。感知、推理、规划、行动统一框架。
- **与本仓库关系**: 架构对齐参考（observer / task / action / supervisor）。

### A Comprehensive Survey of Agents for Computer Use
- **arXiv**: [2501.16150](https://arxiv.org/abs/2501.16150)
- **要点**: 87 个 ACU + 33 个数据集的系统调查。从环境、交互、智能体三个维度分类。
- **与本仓库关系**: 定位缺口（泛化、学习效率、规划、评估标准化）。

### Agent S2: A Compositional Generalist-Specialist Framework for Computer Use Agents
- **arXiv**: [2504.00906](https://arxiv.org/abs/2504.00906)
- **要点**: 组合式架构（通用 + 专家）。Mixture of Grounding + Proactive Hierarchical Planning。在 WindowsAgentArena 上大幅提升。
- **与本仓库关系**: 多步规划、失败恢复、专家接地（grounding）可借鉴。

### OpenCUA: Open Foundations for Computer-Use Agents
- **arXiv**: [2508.09123](https://arxiv.org/abs/2508.09123)
- **NeurIPS 2025 Spotlight**
- **要点**: 开源数据与基础模型框架。AgentNet 数据集。OpenCUA-72B 在 OSWorld-Verified 上约 45%。
- **与本仓库关系**: 人类演示数据、长思维链、经验学习可参考其数据管线。
- **项目**: https://github.com/xlang-ai/OpenCUA

## 2. Windows 相关与工程实践

### UFO / UFO2（Microsoft）
- Windows Desktop AgentOS。结合 UI Automation + 视觉。
- Host agent + per-app agents。
- 支持 picture-in-picture 虚拟桌面，不占用用户主屏幕。
- **与本仓库关系**: 可访问性树、窗口管理、安全执行模式。

### Hybrid Computer Use（HCU）
- **arXiv**: [2610.41432](https://arxiv.org/abs/2610.41432)
- **要点**: 程序化（code/CLI）+ 语义（Accessibility）+ 视觉（GUI）三通道统一接口。
- **与本仓库关系**: 观察与动作可同时支持可访问性树和截图，减少失效点击。

### Mage-VL-Cowork（Microsoft）
- 4B 混合 GUI + Code CUA。
- OSWorld-Verified 66%（50-step）。
- **与本仓库关系**: 小模型 + 代码执行 + GUI 操作的混合策略，适合本地执行层。

## 3. 安全、验证与失败处理

### What Does "Now" Mean to Your Computer-Use Agent?
- **arXiv**: [2610.39282](https://arxiv.org/abs/2610.39282)
- **要点**: 截图陈旧、页面加载导致点击失效。点击前应做像素对比或状态检查。
- **与本仓库关系**: 监督循环与验证步骤必须考虑状态一致性，避免在旧截图上执行动作。

### OS-Harm / RiOSWorld
- 安全风险基准。敏感操作、提示注入、误用风险。
- **与本仓库关系**: 闸门与人工批准通道的设计依据。

## 4. 数据与经验学习

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
| UFO | Microsoft Windows Desktop Agent | 搜索 Microsoft UFO |
| awesome-computer-use | 论文/工具汇总 | https://github.com/TianyuanYang/awesome-computer-use |

## 6. 对本仓库下一步开发的建议映射

| 本仓库模块 | 建议参考 |
|------------|----------|
| observer（截图） | OSWorld / WindowsAgentArena 观察协议；截图陈旧检测（2610.39282） |
| accessibility | UFO / HCU 的 AX 通道；GroundCUA |
| action（SendInput） | 各基准中的低层动作空间定义；安全闸门设计 |
| task + 失败恢复 | Agent S2 的层次规划；OSWorld 任务结构 |
| supervisor / 人工批准 | OS-Harm 安全思考；点击前验证 |
| experience 学习 | OpenCUA / AgentNet 轨迹收集与反思 |

---

**使用方式**：下次开发前先读本文件对应条目，再决定要补充哪一块能力。论文链接直接点击即可获取原文。
