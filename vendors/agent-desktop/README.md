# agent-desktop (CUA tool)

Vercel Labs agent-desktop — 通过 Accessibility Tree 做精准桌面操作，作为 DSH-- 的 CUA 工具层。

## 快速拉入

```bash
# 在 DSH-- 根目录执行
bash vendors/agent-desktop/setup.sh
```

或手动：

```bash
cd vendors/agent-desktop
git clone --depth 1 https://github.com/vercel-labs/agent-desktop.git src
cd src && npm install
npm install -g .
agent-desktop --version
```

## 作为 CUA 工具使用

见 `cua/agent-desktop-tool.js`。

核心命令：
- `agent-desktop snapshot --app "<app>" -i`
- `agent-desktop click @<ref>`
- `agent-desktop type @<ref> "text"`

## 注意
- 本目录只保存接入说明与脚本，完整源码由 setup 脚本拉取到 `vendors/agent-desktop/src`。
- 不修改 agent-desktop 上游源码，只做工具层封装。
