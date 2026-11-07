#!/usr/bin/env node
// resume-task.cjs — 中断恢复驱动(只读):解码任一会话 → 产出续跑简报
// 回答四个问题:目标是什么/已做了什么/验证到哪/下一步建议;不修改任何会话数据
// 用法: node resume-task.cjs <session.v4.jsonl.zstd> [--out <brief.md>]
'use strict';
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const src = process.argv[2];
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null;
if (!src || !fs.existsSync(src)) { console.error('用法: node resume-task.cjs <session.v4.jsonl.zstd> [--out brief.md]'); process.exit(1); }

function decodeFrames(buf) {
  const chunks = []; let o = 0;
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

const lines = [];
for (const c of decodeFrames(fs.readFileSync(src))) {
  for (const line of c.toString('utf8').split('\n')) {
    if (line.trim()) { try { lines.push(JSON.parse(line)); } catch {} }
  }
}

const goals = [], texts = [], calls = [], ends = [], todos = [];
const pickText = (e) => {
  const c = e.data && e.data.content;
  return (Array.isArray(c) ? c.map((x) => x.text || '').join(' ') : String(c || '')).trim();
};
for (const e of lines) {
  const t = e.type || '';
  if (t === 'user/message') {
    const txt = pickText(e);
    if (txt && !/^Current (working directory|runtime context)/.test(txt) && !txt.startsWith('<') && !txt.startsWith('{') && !txt.startsWith('[model changed')) goals.push(txt.slice(0, 300));
  } else if (t === 'assistant/message') {
    const txt = pickText(e);
    if (txt) texts.push(txt);
  } else if (t === 'tool/call') {
    const d = e.data || {};
    const name = d.name || '?';
    const a = d.arguments || d.args || d.input || {};
    calls.push({ name, brief: String(a.command || a.file_path || a.path || JSON.stringify(a)).slice(0, 140), fp: a.file_path || a.path || null });
    if (/todo/i.test(name)) todos.push(a);
  } else if (t === 'turn/end') {
    const r = (e.data && e.data.reason) || {};
    ends.push((r.kind || '?') + (r.code ? ':' + r.code : ''));
  }
}
const writes = calls.filter((c) => /write|edit/i.test(c.name) && c.fp).map((c) => String(c.fp).replace(/^.*[\\/]/, ''));
const bashes = calls.filter((c) => c.name === 'bash' || c.name === 'pwsh').map((c) => c.brief);
const testRuns = bashes.filter((b) => /--test|npm test|node --check/.test(b));

const brief = [];
brief.push('# 会话续跑简报(自动生成,只读解码)');
brief.push('- 会话: ' + path.basename(path.dirname(src)) + ' / ' + path.basename(src));
brief.push('- 事件行数: ' + lines.length + ' | 工具调用: ' + calls.length + ' | 回合终止: ' + (ends.join(', ') || '无(可能被强杀)'));
brief.push('');
brief.push('## 目标(用户消息)');
goals.slice(0, 5).forEach((g) => brief.push('- ' + g.replace(/\n/g, ' ')));
brief.push('');
brief.push('## 已做(写/改过的文件)');
(writes.length ? [...new Set(writes)] : ['(无写/改记录)']).forEach((w) => brief.push('- ' + w));
brief.push('');
brief.push('## 验证状态(测试/检查命令,最近 ' + Math.min(6, testRuns.length) + ' 条)');
(testRuns.length ? testRuns.slice(-6) : ['(未发现测试/检查命令)']).forEach((b) => brief.push('- ' + b));
brief.push('');
if (todos.length) {
  brief.push('## 任务清单最新状态(todo 工具)');
  brief.push('```json');
  brief.push(JSON.stringify(todos[todos.length - 1], null, 1).slice(0, 1200));
  brief.push('```');
}
brief.push('');
brief.push('## 最后动作(最近 5 次调用)');
calls.slice(-5).forEach((c) => brief.push('- [' + c.name + '] ' + c.brief));
brief.push('');
const lastText = (texts[texts.length - 1] || '').slice(0, 600);
brief.push('## 模型最后陈述(截断)');
brief.push(lastText || '(无)');
brief.push('');
brief.push('## 续跑建议提示词(交给下一次会话)');
brief.push('> 继续未完成的任务。目标: ' + (goals[goals.length - 1] || '(见上)').replace(/\n/g, ' ').slice(0, 150));
brief.push('> 已写/改文件: ' + ([...new Set(writes)].join(', ') || '无') + '。先重跑上次验证命令确认现状,再从"最后动作"之后继续;完成后按原验收标准全量复验。');
const md = brief.join('\n');
if (outPath) { fs.writeFileSync(outPath, md); console.log('简报已写: ' + outPath); }
console.log(md);
