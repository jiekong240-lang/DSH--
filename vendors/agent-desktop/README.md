# agent-desktop (CUA 核心工具)

## 仓库点位
- 目标路径：`vendors/agent-desktop/`
- 当前状态：占位说明 + setup 脚本（完整源码待拉入）

## 下载地址
- 上游仓库：https://github.com/vercel-labs/agent-desktop.git
- 官方页面：https://github.com/vercel-labs/agent-desktop

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
