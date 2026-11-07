# CUA 本体

Windows Computer Use Agent 的核心实现目录。

**首要核心，勿删除**：
- 屏幕截图 + 视觉理解接口（`observer.js`）
- 精确鼠标/键盘控制（SendInput 级别，`action.js`）
- 可访问性树 / UI 元素定位（`accessibility.js`）
- 任务契约驱动的多步规划与失败恢复（`task.js`）
- Supervisor / Guardian 闭环与人工批准通道（`supervisor.js` + `gate.js`）

## 目标闭环

```
观察 (observer + accessibility) → 决策 (task / API) → 执行 (action) → 验证 (observer) → 回写状态
```

每一步都必须有可追踪的证据（截图、事件、审计）。

## 模块

- `observer.js` — 屏幕观察 + 截图（CORE）
- `accessibility.js` — 可访问性树（CORE）
- `action.js` — 鼠标键盘动作（CORE）
- `task.js` — 任务契约与失败恢复（CORE）
- `supervisor.js` — 监督循环与人工批准（CORE）
- `gate.js` — 权限闸门
- `index.js` — 主入口

## 原则

- 默认拒绝高风险动作
- 状态可持久化
- 不假绿
- 视觉理解走 API，本地只负责截图与执行
- 零依赖优先（Node 原生 + 必要时系统调用）

详见 `../docs/CUA_ARCHITECTURE.md` 与 `../docs/CUA_PROGRESS.md`
