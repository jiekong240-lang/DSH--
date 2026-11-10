# DeepSeek Harness MCP 自主编程入口

`cua/mcp-server.js` 暴露 **cua_coding_repair** 工具，复用 `coding-loop.js` 的真实“读仓库 → 补丁 → 运行固定测试 → 按报错改 → 证据落盘”闭环。MCP stdio 基于按行 JSON-RPC，无需新增 npm 依赖，也不修改官方 Harness 包。

## 独立启动与连接

从仓库根目录运行：`node cua/mcp-server.js`。在 DSH 的 MCP 配置或插件中，将其注册为命令 `node`、参数为本仓 `cua/mcp-server.js` 的**绝对路径**。具体 DSH 配置位置仍须按实际安装版本核实，不保证任意版本自动发现。

环境变量：`DEEPSEEK_API_KEY`（必需）；可选 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`。请通过运行环境注入密钥，不要提交密钥。

工具参数示例：

```json
{
  "project": "C:\\dev\\example",
  "goal": "修复现有失败的测试，保持既有功能",
  "verifyCommand": ["node", "--test"],
  "maxRounds": 3
}
```

MCP 返回 `status`、`changedPaths`、`rounds`、`baseline` 及 `reportPath`。只有真实测试进程成功退出才标记 `verified`。原来就绿的基线标记 `baseline-passing`，不是修复。

## 验收边界

`node --test cua/tests/mcp-server.test.cjs` 使用真实 MCP 子进程、本地伪 DeepSeek HTTP、真实 Node 检查，实现独立、可复现的接口纵向测试，不消耗 API 额度。

本 MCP 尚未在用户的正式 DSH 安装版本或真实 DeepSeek API 上复核，也没有实现复杂多文件改动、自动 PR、真机 IDE 操作或产品交付的独立重开验收。
