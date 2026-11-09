# docs/papers — DSH / CUA「真能干活」支撑文献

本目录是 [DSH--](https://github.com/jiekong240-lang/DSH--) 的**学术与工程文献归档**，只收能直接服务「Computer-Use Agent 真正把任务做完」的资料，不堆纯安全/纯监控论文。

## 技术范围（收什么）

| 主题 | 作用（对应本仓 / sandbox 缺口） |
|------|----------------------------------|
| CUA / GUI Agent **任务完成率**评测（OSWorld、Windows Agent Arena 等） | 定义「做成」的外部标准；给 `stage1-*`、瞭望与后续桌面题库定尺子 |
| **长程任务与检查点续跑** | 把 `resume-task.cjs` 从只读简报升级成可再发车的状态机 |
| **多轮工具规划 / 自我纠错** | 提升 DSH agent-loop 编辑→测→修闭环 |
| **跨会话记忆与状态携带** | 粘住 `sessionId`、记忆注入与召回，避免跨轮丢上下文 |
| **成本约束下的级联路由** | 服务 `free-ladder` / `quota-probe`：少钱也要把活跑完 |
| **轨迹级「声称 vs 做成」评测** | 反假绿；对齐 `stage1-accept`、claim-gate、lookout「截图不作判据」 |
| **Windows 进程编排与可靠取消** | 杀进程树、挂死恢复；对齐维护脚本与 stage1 发车 |
| **最小特权但不伤主路径** | 闸门只挡危险，不挡 Edit/Bash 干活；误伤 gate 的放宽依据 |

**刻意少收**：纯红队、纯监控炫技、与完成率/续跑无关的保镖论文。

## 目录约定

```
docs/papers/
  README.md                 ← 本说明（技术范围与作用）
  INDEX.md                  ← 条目总表（标题 / 主题标签 / 对应缺口 / 链接）
  batches/YYYY-MM-DD.md     ← 每次整理批次：新增条目 + 简短作用说明
```

精选「必读」映射仍保留在旁路文件：

- [`docs/references/CUA_FRONTIER_REFERENCES.md`](../references/CUA_FRONTIER_REFERENCES.md) — 与 `cua/` 模块（观察/动作/监督/经验）一一对应的前沿清单

## 维护方式

1. 双日检索归档后，**必须**把整理结果推进本仓库本目录（新建或追加 `batches/`，并更新 `INDEX.md`）。
2. 每篇写清：**标题、链接、对应干活缺口、一句话技术作用**；禁止只贴链接不写作用。
3. 批次 README/正文用中文；论文原名与 arXiv 号保留英文。

## 与本仓其它文档的关系

| 文档 | 角色 |
|------|------|
| 根 `README.md` | 运维面 SPEC / 启动入口 |
| `docs/CUA_ARCHITECTURE.md` | CUA 模块结构 |
| `docs/references/CUA_FRONTIER_REFERENCES.md` | 精选必读与模块映射 |
| **本目录** | 持续扩充的文献库 + 批次说明 |

---

*首次落盘：2026-11-08（UTC+8）· 对齐「真能干活」复审结论*
