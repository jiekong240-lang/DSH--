// inspect-toolresult.cjs — 提取会话里 tool/call 与 tool/result 的真实 schema
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

const lines = decode().split('\n').filter((l) => l.trim());
let calls = 0, results = 0;
for (const l of lines) {
  let j = null; try { j = JSON.parse(l); } catch { continue; }
  const t = j.type || (j.payload && j.payload.type);
  if (t === 'tool/call' && calls < 1) {
    calls++;
    console.log('=== tool/call 样本 ===');
    console.log(l.slice(0, 700));
  }
  if (t === 'tool/result' && results < 1) {
    results++;
    console.log('=== tool/result 样本 ===');
    console.log(l.slice(0, 700));
  }
}
console.log('tool/call x', calls, '| tool/result x', results);
