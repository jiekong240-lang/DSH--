# Windows CUA 架构

## 设计目标

在 Windows 上实现可信的 Computer Use Agent：

- 真实屏幕观察与操作
- 任务契约驱动
- 监督循环与权限闸门
- 可审计、可恢复、不假绿
- 外部 API 大脑（视觉/规划）+ 本地执行层

## 当前状态（2026-11-08）

- `cua/` 下已建立闭环骨架，含验证与名称解析
- 监督模块已支持本地审计日志（`logs/cua-audit.jsonl`，含 verification）
- 外部大脑骨架：`cua/brain.js`（环境变量 `CUA_VISION_API`）
- 进展记录见 `docs/CUA_PROGRESS.md`
- 验证命令：`node cua/index.js`（Windows 本机）

## 最小可行闭环

1. **Observer** — 获取当前屏幕状态（截图、窗口列表、焦点窗口、AX 树）
2. **Decision** — 本地 task.decide 或外部 brain API 建议；支持 targetName 解析为坐标
3. **Action** — 执行鼠标/键盘/窗口操作（受闸门约束）
4. **Verify** — 再次观察 + compareObservations 检查焦点/截图变化
5. **Persist** — 写入任务状态、审计日志、经验学习

## 权限模型（对齐现有 sentinel）

| 级别 | 说明 | 示例 |
|------|------|------|
| L0 | 只读 | 截图、查询窗口 |
| L1 | 提醒 | 通知用户 |
| L2 | 白名单可逆 | 写指定目录下的文件 |
| L3 | 人工一次性批准 | 删除、系统设置、网络请求 |

闸门必须由代码强制，不能只靠提示词。

## 任务契约（草稿）

```json
{
  "id": "task-001",
  "goal": "打开记事本并输入文本",
  "steps": [
    {"action": "open", "target": "notepad"},
    {"action": "click", "targetName": "无标题 - 记事本"},
    {"action": "type", "text": "hello"}
  ],
  "success": "窗口存在且含指定文本",
  "onFailure": "retry_or_abort"
}
```

## 与现有设施的关系

- 复用 sentinel 的闸门思路与审计机制
- 监控大屏可接收 CUA 事件（通过 /api/event）
- cua-lookout 可继续作为外部健康检查
- 外部视觉/规划 API 通过 `cua/brain.js` 接入

## 实现约束

- 优先零 npm 依赖
- Windows 原生 API / PowerShell / 可访问性接口
- 所有动作必须可被监督代理拦截
- 状态存储在本地，不依赖外部服务
- 视觉理解与长规划走外部 API

## 验证与追溯

- 运行后检查 `logs/cua-audit.jsonl` 是否有新记录（含 verification）
- 对照 `docs/CUA_PROGRESS.md` 确认此次改动范围
- 所有关键决策必须在代码注释或日志中标注日期与原因
