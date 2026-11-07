# CUA 进展日志（可追溯）

每次改动都在此记录：做了什么、改了哪里、证据是什么、下一步是什么。

## 2026-11-08

### 已完成
- 建立 `cua/` 目录与最小闭环骨架（index / observer / action / task / supervisor / gate）
- 根 README 重新定位为 CUA 主线，监控降级为支持
- 新增 `docs/CUA_ARCHITECTURE.md` 与本日志
- 所有模块当前为可运行占位，闭环可通过 `node cua/index.js` 验证
- **supervisor 已支持本地审计日志写入**（`logs/cua-audit.jsonl`）
- 各模块增加 TRACE 日期标记，便于下次对照
- **观察模块接入真实窗口枚举**（PowerShell Get-Process 过滤 MainWindowTitle）
- **闸门对齐 sentinel/gate.cjs**（映射动作到 LEVELS，调用 decide()）
- **任务契约持久化**（`state/cua-task.json`，支持加载/保存/推进）
- **动作模块接入基础真实输入**（PowerShell Start-Process / SendKeys，受闸门约束）

### 证据
- Git 提交记录：搜索 `feat(cua):` 前缀
- 本地运行：`node cua/index.js`
  - 应能枚举窗口（observation.windows 非空）
  - 任务写入 `state/cua-task.json`
  - 审计写入 `logs/cua-audit.jsonl`
  - open/type 等 L3 动作默认被闸门拦下
- 代码注释中含 TRACE 2026-11-08 标记

### 当前状态
- 观察：真实窗口枚举（无截图）
- 闸门：已对齐 sentinel，L3 默认拒绝
- 任务：可持久化、可推进
- 动作：基础 open/type 可执行（需闸门放行），其余仍受限
- 审计可落盘

### 下一步（优先级）
1. 观察模块加截图
2. 闸门增加人工批准通道（与哨兵对齐）
3. 任务失败恢复与重试策略
4. 动作模块扩展更安全的输入方式（可访问性接口）

### 验证方式
- 运行 `node cua/index.js` 应输出含窗口列表的观察结果
- 检查 `state/cua-task.json` 是否生成/更新
- 检查 `logs/cua-audit.jsonl` 是否有新行
- 对照本日志与 git log 是否同步
