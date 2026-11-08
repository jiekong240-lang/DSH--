# MCP 改装模板 · 十步开工(复制改名即用)

1. `xcopy mcp\_template-open-mod mcp\<name>\ /E /I`(或资源管理器复制)
2. 改 `mcp\<name>\server.mjs` 里的 `MOD_NAME` 为 `<name>`;把 `template_probe` 换成你的业务工具(inputSchema + callTool 分支)
3. 打开 `dsh-home\cordis.patch.yml`,追加(勿动其它块):
```yaml
- insert:
    - id: mcp-<name>
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: <name>
        command: node
        args: ['C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/mcp/<name>/server.mjs']
        cwd: 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/mcp/<name>'
```
4. `node tools\bind-cordis-paths.mjs`
5. 自检:`node tools\open-mod-guard.mjs`(PASS 才继续)
6. 冒烟:`node tools\open-mod-smoke.mjs mcp\<name>\server.mjs`(initialize/tools/call 3 项)
7. 组装核验:`node node_modules\@deepseek-ai\dsh\lib\bin.js --dump-config --profile headless | findstr <name>`
8. 挂坏负例(可选):入口首行加 `throw`,复跑冒烟 → 报错可检、主进程无关;还原
9. 收尾:git add + commit;删除或保留改装均可(摘除=注释第 3 步的 insert 块)
10. 回信附证据:`evidence/` 下 smoke/negative 输出

纪律:零 npm 依赖;不改 `node_modules/@deepseek-ai/**`;禁止 `patches/* --apply`。
