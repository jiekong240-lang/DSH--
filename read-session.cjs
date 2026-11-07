// read-session.cjs v3 — 正确 schema 提取(只读)
const zlib = require('node:zlib');
const fs = require('node:fs');
const src = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/sessions/--C-Users-64562-WorkBuddy-2026-10-12-13-09-47-dsh-sandbox--/session-ad31b52b-ae64-4550-a0c3-effc2aa3d067/session.v4.jsonl.zstd';

function decode() {
  const b = fs.readFileSync(src);
  const chunks = [];
  let o = 0;
  const M = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  while (o < b.length - 3) {
    if (b.readUInt32LE(o) !== 4247762216) { o++; continue; }
    let n = b.indexOf(M, o + 4);
    if (n === -1) n = b.length;
    try { chunks.push(zlib.zstdDecompressSync(b.subarray(o, n))); } catch (e) {}
    o = n;
  }
  return Buffer.concat(chunks).toString('utf8');
}

const text = decode();
const lines = text.split('\n').filter((l) => l.trim());
const evs = [];
for (const l of lines) {
  try { const j = JSON.parse(l); evs.push({ type: j.type, t: j.time, data: j.data }); } catch {}
}

const textOf = (c) => Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('\n') : String(c || '');

console.log('===== 用户消息 =====');
for (const e of evs) {
  if (e.type === 'user/message') {
    const m = e.data && e.data.message;
    if (m) console.log('[' + new Date(e.t).toLocaleTimeString() + ']\n' + textOf(m.content).slice(0, 900) + '\n');
  }
}
console.log('===== 工具调用序列 =====');
for (const e of evs) {
  if (e.type === 'tool/call') {
    const d = e.data || {};
    const args = d.args ? JSON.stringify(d.args).slice(0, 90) : '';
    console.log('[' + new Date(e.t).toLocaleTimeString() + '] ' + (d.tool || '?') + ' ' + args);
  }
  if (e.type === 'tool/result') {
    const d = e.data || {};
    const s = JSON.stringify(d).slice(0, 160);
    if (/error|fail|denied|EACCES|EPERM|ENOENT|429|quota/i.test(s)) console.log('   ⚠ result: ' + s);
  }
}
console.log('===== LLM 重试 =====');
for (const e of evs) {
  if (e.type === 'llm/retry' || e.type === 'llm/retry-started') {
    console.log('[' + new Date(e.t).toLocaleTimeString() + '] ' + JSON.stringify(e.data).slice(0, 300));
  }
}
console.log('===== 收尾 =====');
for (const e of evs) {
  if (e.type === 'assistant/message') {
    const m = e.data && e.data.message;
    if (m) console.log('[assistant ' + new Date(e.t).toLocaleTimeString() + ']\n' + textOf(m.content).slice(0, 800) + '\n');
  }
  if (e.type === 'turn/end') {
    console.log('[turn/end ' + new Date(e.t).toLocaleTimeString() + '] ' + JSON.stringify(e.data.reason).slice(0, 500));
  }
}
