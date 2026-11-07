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

### 证据
- Git 提交记录：搜索 `feat(cua):` 与 `docs:` 前缀
- 本地运行：`node cua/index.js` 输出占位结果，无崩溃，并在 `logs/cua-audit.jsonl` 产生记录
- 代码注释中含 TRACE 2026-11-08 标记

### 当前状态
- 观察、动作、闸门、监督均为 stub（已带追溯标记）
- 无真实截图、无真实输入注入
- 审计日志已可落盘

### 下一步（优先级）
1. 观察模块接入真实窗口枚举（PowerShell / Win32）
2. 闸门与现有 sentinel 逻辑对齐或复用
3. 任务契约持久化（本地 JSON）
4. 动作模块接入真实输入注入（受闸门约束）

### 验证方式
- 运行 `node cua/index.js` 应输出完整闭环结果
- 检查 `logs/cua-audit.jsonl` 是否有新行
- 对照 `docs/CUA_PROGRESS.md` 与 git log 是否同步
