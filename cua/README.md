# CUA 本体

Windows Computer Use Agent 的核心实现目录。

## 目标闭环

```
观察 (observer) → 决策 (task / supervisor) → 执行 (action) → 验证 (observer) → 回写状态
```

每一步都必须有可追踪的证据（截图、事件、审计）。

## 模块

- `observer.js` — 屏幕与窗口观察
- `action.js` — 鼠标、键盘、窗口操作
- `task.js` — 任务契约、状态机、恢复点
- `supervisor.js` — 监督循环、失败检测、重试策略
- `gate.js` — 权限闸门（对齐现有 sentinel 思路）
- `index.js` — 主入口

## 原则

- 默认拒绝高风险动作
- 状态可持久化
- 不假绿
- 零依赖优先（Node 原生 + 必要时系统调用）

详见 `../docs/CUA_ARCHITECTURE.md`
