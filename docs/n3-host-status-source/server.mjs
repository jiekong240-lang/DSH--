#!/usr/bin/env node
// host-status - N3 (from _template-open-mod, 2026-11-08). Read-only host health probe.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../_shared/jsonrpc.mjs';
const MOD_NAME = 'host-status';
const SB = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
function tcpProbe(port, timeoutMs = 1000) { return new Promise((resolve) => { const s = net.connect({ port, host: '127.0.0.1', timeout: timeoutMs }); const done = (st) => { try { s.destroy(); } catch {} resolve(st); }; s.on('connect', () => done('up')); s.on('timeout', () => done('timeout')); s.on('error', (e) => done(e.code === 'ECONNREFUSED' ? 'down' : 'unknown:' + e.code)); }); }
function dshPinned() { try { return JSON.parse(fs.readFileSync(path.join(SB, 'package.json'), 'utf8')).dependencies['@deepseek-ai/dsh']; } catch (e) { return 'unknown: ' + String(e).slice(0, 60); } }
const TOOLS = [{ name: 'host_status', description: 'Read-only host health: workspace existence, TCP 3080/3210/11434, pinned DSH version. Never use for writes.', inputSchema: { type: 'object', properties: { sandboxPath: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true } }];
await startServer({ serverName: MOD_NAME, serverVersion: '1.0.0', instructions: 'Read-only host health probe. Strictly read-only.', tools: TOOLS,
  callTool: async (name, args) => {
    if (name !== 'host_status') return { content: [{ type: 'text', text: 'unknown tool: ' + name }], isError: true };
    const sandboxPath = String(args?.sandboxPath || SB);
    let sandboxExists = false; try { sandboxExists = fs.existsSync(sandboxPath); } catch {}
    let pin = 'skipped'; try { pin = dshPinned(); } catch (e) { pin = 'unknown'; }
    const ports = {}; for (const p of [3080, 3210, 11434]) ports[String(p)] = await tcpProbe(p);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, mod: MOD_NAME, sandboxExists, dshPinned: pin, ports, ts: new Date().toISOString() }) }] };
  },
  log: (...a) => process.stderr.write('[host-status] ' + a.join(' ') + '\n') });
