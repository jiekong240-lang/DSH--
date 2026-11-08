#!/usr/bin/env node
/**
 * _template-open-mod — MCP 改装模板(复制 mcp/_template-open-mod → mcp/<name>/ 即开工)
 *
 * 协议:mcp/_shared/jsonrpc.mjs 的 startServer(stdio JSON-RPC,与 memory/repomap/open-probe 同款)。
 * 工具行为:返回固定 JSON {ok:true, mod:'<name>', ts:<ISO>} —— 复制后把 MOD_NAME 改成你的改装名。
 * 纪律:零 npm 依赖;不改 node_modules/@deepseek-ai/**;摘除=注释 cordis.patch.yml 的 insert 块。
 */
import { startServer } from '../_shared/jsonrpc.mjs';

const MOD_NAME = 'template-open-mod'; // ← 复制后改成你的改装名

const TOOLS = [
  {
    name: 'template_probe',
    description: '改装工位探针:返回固定 JSON,证明 MCP 流水线端到端可用。复制后按需改成你的业务工具。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

await startServer({
  serverName: MOD_NAME,
  serverVersion: '1.0.0',
  instructions: 'Open-mod template. Replace the probe tool with your own; keep the startServer contract.',
  tools: TOOLS,
  callTool: async (name) => {
    if (name === 'template_probe') {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, mod: MOD_NAME, ts: new Date().toISOString() }) }] };
    }
    return { content: [{ type: 'text', text: 'unknown tool: ' + name }], isError: true };
  },
  log: (...a) => process.stderr.write('[' + MOD_NAME + '] ' + a.join(' ') + '\n'),
});
