#!/usr/bin/env node
// session-schema.cjs — 诊断:统计会话事件类型分布 + 抽样 user 类事件原文(只读)
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');
const src = process.argv[2];
if (!src) { console.error('用法: node session-schema.cjs <session.v4.jsonl.zstd>'); process.exit(1); }
const b = fs.readFileSync(src);
const chunks = []; let o = 0;
while (o <= b.length - 4) {
  if (b.readUInt32LE(o) !== 4247762216) { o++; continue; }
  let end = o + 4;
  while (end <= b.length - 4 && b.readUInt32LE(end) !== 4247762216) end++;
  try { chunks.push(zlib.zstdDecompressSync(b.subarray(o, end))); } catch {}
  o = end;
}
const lines = [];
for (const c of chunks) for (const l of c.toString('utf8').split('\n')) { if (l.trim()) { try { lines.push(JSON.parse(l)); } catch {} } }
const counts = {};
for (const e of lines) counts[e.type || '(none)'] = (counts[e.type || '(none)'] || 0) + 1;
console.log('type 分布:', JSON.stringify(counts));
for (const e of lines) {
  const t = e.type || '';
  if (/user/i.test(t)) { console.log('USER类样本: ' + JSON.stringify(e).slice(0, 500)); break; }
}
