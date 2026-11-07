#!/usr/bin/env node
// read-session-any.cjs — 只读解码任意 session.v4.jsonl.zstd(多帧 zstd 扫描),输出用户消息与工具调用轨迹
// 用法: node read-session-any.cjs <session文件路径> [maxEvents]
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');

const src = process.argv[2];
const maxEvents = Number(process.argv[3]) || 400;
if (!src || !fs.existsSync(src)) { console.error('用法: node read-session-any.cjs <session.v4.jsonl.zstd>'); process.exit(1); }

function decodeFrames(buf) {
  const chunks = [];
  let o = 0;
  const M = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  while (o < buf.length - 3) {
    if (buf.readUInt32LE(o) !== 4247762216) { o++; continue; }
    let end = o + 4;
    while (end <= buf.length - 4 && buf.readUInt32LE(end) !== 4247762216) end++;
    try { chunks.push(zlib.zstdDecompressSync(buf.subarray(o, end))); } catch {}
    o = end;
  }
  return chunks;
}

const lines = [];
for (const c of decodeFrames(fs.readFileSync(src))) {
  for (const line of c.toString('utf8').split('\n')) {
    if (line.trim()) { try { lines.push(JSON.parse(line)); } catch {} }
  }
}
console.log('frames->jsonl lines:', lines.length);
let shown = 0;
for (const e of lines) {
  if (shown >= maxEvents) break;
  const t = e.type || '';
  if (t === 'user/message') {
    const c = e.data && e.data.message && e.data.message.content;
    const txt = Array.isArray(c) ? c.map((x) => x.text || '').join(' ') : String(c || '');
    if (txt.trim()) { console.log(`\n[USER] ${txt.slice(0, 300)}`); shown++; }
  } else if (t === 'assistant/message') {
    const c = e.data && e.data.message && e.data.message.content;
    const txt = Array.isArray(c) ? c.map((x) => x.text || '').join(' ') : '';
    if (txt.trim()) { console.log(`[ASST] ${txt.slice(0, 200).replace(/\n/g, ' ')}`); shown++; }
  } else if (t === 'tool/call') {
    const d = e.data || {};
    const name = d.name || d.tool || '?';
    let brief = '';
    const a = d.arguments || d.args || d.input || {};
    if (a.command) brief = String(a.command).slice(0, 110);
    else if (a.file_path || a.path) brief = 'file=' + String(a.file_path || a.path).slice(-80);
    else brief = JSON.stringify(a).slice(0, 110);
    console.log(`[CALL] ${name} ${brief}`);
    shown++;
  } else if (t === 'tool/result') {
    const d = e.data || {};
    let txt = '';
    const c = d.result || d.output || d.content;
    if (typeof c === 'string') txt = c;
    else if (c && c.content) txt = JSON.stringify(c.content);
    else txt = JSON.stringify(c || '');
    console.log(`[RSLT] ${txt.slice(0, 150).replace(/\n/g, ' ')}`);
    shown++;
  } else if (t === 'turn/end') {
    const r = (e.data && e.data.reason) || {};
    console.log(`[TURN-END] kind=${r.kind || '?'} code=${r.code || '-'}`);
    shown++;
  }
}
