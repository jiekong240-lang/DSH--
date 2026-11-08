#!/usr/bin/env node
// mod-echo - N1 sample (from _template-open-mod, 2026-11-08)
import { startServer } from '../_shared/jsonrpc.mjs';
const MOD_NAME = 'mod-echo';
const TOOLS = [{ name: 'mod_echo', description: 'echo a string field', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, annotations: { readOnlyHint: true } }];
await startServer({ serverName: MOD_NAME, serverVersion: '1.0.0', instructions: 'echo sample', tools: TOOLS,
  callTool: async (name, args) => { if (name === 'mod_echo') { return { content: [{ type: 'text', text: JSON.stringify({ ok: true, echo: String(args?.text ?? ''), mod: MOD_NAME }) }] }; } return { content: [{ type: 'text', text: 'unknown tool: ' + name }], isError: true }; },
  log: (...a) => process.stderr.write('[mod-echo] ' + a.join(' ') + '\n') });
