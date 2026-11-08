# agent-desktop (CUA 核心工具)

## 仓库点位
- 目标路径：`vendors/agent-desktop/`
- 当前状态：占位说明 + setup 脚本（完整源码待拉入）

## 下载地址
- 上游仓库：https://github.com/vercel-labs/agent-desktop.git
- 官方页面：https://github.com/vercel-labs/agent-desktop

## 作用
- CUA 的核心操作通道（Accessibility Tree + @ref）
- 不靠截图猜坐标，直接读取系统无障碍树，给每个可操作元素稳定引用
- 提供 snapshot / click / type / press 等精准动作
- 已接入 `cua/action.js`，优先于纯坐标操作
- 配合 LLM 大脑做「观察 → 决策 → 执行 → 验证」闭环

## 拉入方式
```bash
# 在 DSH-- 根目录执行
bash vendors/agent-desktop/setup.sh
```

或 submodule：
```bash
git submodule update --init --recursive
```

## 作为 CUA 工具
见 `cua/agent-desktop-tool.js`（已接入 action.js 调度）。
