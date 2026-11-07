#!/usr/bin/env node
// report-test.cjs — 把本地测试结果上报 DSH live-code 面板(/test-external,仅回环)
// 用法: node report-test.cjs <status:passed|failed> <file> <output> [command]
'use strict';
const [status, file, output, command] = process.argv.slice(2);
fetch('http://127.0.0.1:3080/dsh-live-code/test-external', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ file: file || '?', status: status || 'unknown', output: String(output || '').slice(-1200), command: command || '', at: Date.now() }),
}).then((r) => r.json()).then((j) => { console.log('reported:', j.ok ? 'ok' : JSON.stringify(j)); })
  .catch((e) => { console.error('report failed:', String(e.message || e)); process.exit(1); });
