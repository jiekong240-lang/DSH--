#!/usr/bin/env node
// scan-sessions.cjs — 只读扫描指定日期的 sandbox 会话,找包含关键字的会话(解码 zstd 多帧)
// 用法: node scan-sessions.cjs <MM-DD> <关键字>
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const [dateStr, keyword, rootArg] = process.argv.slice(2);
const ROOT = rootArg || 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/sessions/--C-Users-64562-WorkBuddy-2026-10-12-13-09-47-dsh-sandbox--';
if (!dateStr || !keyword) { console.error('用法: node scan-sessions.cjs <MM-DD> <关键字> [sessions根目录]'); process.exit(1); }

function decodeFrames(buf) {
  const chunks = [];
  let o = 0;
  const M = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  while (o <= buf.length - 4) {
    if (buf.readUInt32LE(o) !== 4247762216) { o++; continue; }
    let end = o + 4;
    while (end <= buf.length - 4 && buf.readUInt32LE(end) !== 4247762216) end++;
    try { chunks.push(zlib.zstdDecompressSync(buf.subarray(o, end))); } catch {}
    o = end;
  }
  return chunks;
}

for (const dir of fs.readdirSync(ROOT)) {
  const full = path.join(ROOT, dir);
  let stat;
  try { stat = fs.statSync(full); } catch { continue; }
  if (!stat.isDirectory() || !stat.mtime.toISOString().slice(5, 10).includes(dateStr.replace('-', '-'))) {
    const m = stat.mtime; if ((m.getMonth() + 1 + '').padStart(2, '0') !== dateStr.split('-')[0] || (m.getDate() + '').padStart(2, '0') !== dateStr.split('-')[1]) continue;
  }
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else files.push(p); } })(full);
  for (const f of files) {
    if (!f.endsWith('.zstd')) continue;
    let text = '';
    try { text = decodeFrames(fs.readFileSync(f)).map((c) => c.toString('utf8')).join('\n'); } catch { continue; }
    if (text.includes(keyword)) {
      // 找该会话的用户消息首条
      const users = [...text.matchAll(/"type":"user\/message".{0,4000}?"text":"((?:[^"\\]|\\.){10,300})"/g)].slice(0, 2)
        .map((m) => m[1].replace(/\\n/g, ' ').slice(0, 160));
      console.log('HIT: ' + dir + ' / ' + path.basename(f) + ' (mtime ' + stat.mtime.toISOString().slice(0, 16) + ')');
      for (const u of users) console.log('  USER: ' + u);
    }
  }
}
console.log('scan done: keyword=' + keyword + ' date=' + dateStr);
