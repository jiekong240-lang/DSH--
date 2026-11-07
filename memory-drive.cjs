// memory-drive.cjs — 向 DSH 记忆库写入监控侧事实并当场召回验证
'use strict';
const { spawn } = require('node:child_process');

const SERVER = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/mcp/memory/server.mjs';
const CWD = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';

const child = spawn(process.execPath, [SERVER], { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const waiters = new Map();
let id = 0;
child.stdout.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const f = JSON.parse(line);
      const w = waiters.get(f.id);
      if (w) { waiters.delete(f.id); w(f); }
    } catch { /* 非 JSON 行忽略 */ }
  }
});
child.stderr.on('data', () => { /* 诊断走 stderr, 不打印 */ });

function send(method, params) {
  return new Promise((res, rej) => {
    const idv = ++id;
    waiters.set(idv, res);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: idv, method, params }) + '\n');
    setTimeout(() => { if (waiters.has(idv)) { waiters.delete(idv); rej(new Error('timeout: ' + method)); } }, 60000);
  });
}

(async () => {
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'twin-verify', version: '1.0' },
  });
  console.log('INIT:', init.result ? 'ok v' + (init.result.serverInfo && init.result.serverInfo.version) : JSON.stringify(init).slice(0, 120));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const fact = '数字孪生花费哨兵位于 C:/Users/64562/Scripts/model-sentinel/model-sentinel.cjs,用 node 运行(支持 --json 参数),审计 DSH 模型路由花费(rotate/QUOTA/付费兜底次数)与 DeepSeek 官方余额。由 ZCode 监控侧于 2026-10-31 写入。';
  const rem = await send('tools/call', { name: 'memory_remember', arguments: { text: fact, category: 'environment' } });
  console.log('REMEMBER:', JSON.stringify(rem.result || rem).slice(0, 220));

  const rec = await send('tools/call', { name: 'memory_recall', arguments: { query: '花费审计工具 sentinel 在哪里 怎么运行', top_k: 3 } });
  const txt = JSON.stringify(rec.result || rec);
  console.log('RECALL-HIT:', txt.includes('model-sentinel') ? '✅ 事实已入库且可召回' : '❌ 未命中');
  console.log('RECALL-DETAIL:', txt.slice(0, 420));
  child.kill();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); try { child.kill(); } catch {} process.exit(1); });
