#!/usr/bin/env node
// open-mod-smoke.mjs — MCP 冒烟/负例助手(N1-d)
// 用法: node tools\open-mod-smoke.mjs <server.mjs 路径> [--negative]
// 好入口:initialize→tools/list→tools/call(第一个工具) 三项;坏入口:报错可检、EXIT=1,主进程无关。
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const serverPath = process.argv[2];
const negative = process.argv.includes('--negative');
if (!serverPath || !fs.existsSync(serverPath)) { console.error('用法: node tools/open-mod-smoke.mjs <server.mjs> [--negative]'); process.exit(2); }

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
child.stdout.on('data', d => {
  buf += d; let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { }
  }
});
child.stderr.on('data', d => process.stderr.write('[srv] ' + d));
let idc = 0;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++idc; pending.set(id, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const raw = obj => child.stdin.write(JSON.stringify(obj) + '\n');

const results = [];
const ok = (n, c, d) => { results.push({ n, ok: !!c }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };

if (negative) {
  // 负例模式:启动即应报错退出(或超时无协议输出)= 可检失败;脚本 EXIT 1,主进程无关
  const t0 = Date.now();
  let exited = false, errOut = '';
  child.on('exit', () => { exited = true; });
  child.stderr.on('data', d => { errOut += d; });
  await new Promise(r => setTimeout(r, 3000));
  ok('negative: 坏入口启动即报错退出', exited && (errOut.includes('Error') || errOut.length > 0), `exited=${exited} err=${errOut.slice(0, 80)}`);
  console.log('SMOKE(负例): ' + (results.every(r => r.ok) ? 'PASS — 失败可检,主进程无关' : 'FAIL'));
  process.exit(results.every(r => r.ok) ? 0 : 1);
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'open-mod-smoke', version: '1.0.0' } });
  ok('initialize', !!init.serverInfo?.name, JSON.stringify(init.serverInfo || {}));
  raw({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const tl = await rpc('tools/list', {});
  const first = (tl.tools || [])[0];
  ok('tools/list 非空', !!first, JSON.stringify((tl.tools || []).map(t => t.name)));
  const call = await rpc('tools/call', { name: first.name, arguments: {} });
  const text = call.content?.[0]?.text || '';
  ok('tools/call 返回内容', text.length > 0, text.slice(0, 100));
  console.log('SMOKE: ' + (results.every(r => r.ok) ? 'PASS' : 'FAIL') + ` (${results.filter(r => r.ok).length}/${results.length})`);
  child.kill();
  process.exit(results.every(r => r.ok) ? 0 : 1);
} catch (e) {
  console.log('SMOKE: FAIL — ' + e.message.slice(0, 120));
  try { child.kill(); } catch { }
  process.exit(1);
}
