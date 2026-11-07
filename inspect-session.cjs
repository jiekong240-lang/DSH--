// inspect-session.cjs — 查看会话 JSONL 的真实结构
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
const types = {};
lines.forEach((l) => {
  try {
    const j = JSON.parse(l);
    const k = [j.type, j.level || '', (j.payload && j.payload.type) || ''].join('|');
    types[k] = (types[k] || 0) + 1;
  } catch { types['parse-err'] = (types['parse-err'] || 0) + 1; }
});
console.log('TYPE 分布:');
Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach((x) => console.log(' ', x[0], 'x' + x[1]));
console.log('\n--- 样本行 3 ---');
console.log((lines[2] || '').slice(0, 700));
console.log('\n--- 样本行 10 ---');
console.log((lines[9] || '').slice(0, 700));
console.log('\n--- 最后一行 ---');
console.log((lines[lines.length - 1] || '').slice(0, 900));
