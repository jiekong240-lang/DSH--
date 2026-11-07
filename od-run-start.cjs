// od-run-start.cjs — 在指定 OpenDesign 项目上启动设计 run(重跑失败流程用)
// 用法: node od-run-start.cjs <projectId> <promptFile>
'use strict';
const http = require('node:http');
const fs = require('node:fs');

const id = process.argv[2];
const promptFile = process.argv[3];
if (!id || !promptFile) { console.error('usage: node od-run-start.cjs <projectId> <promptFile>'); process.exit(2); }
const prompt = fs.readFileSync(promptFile, 'utf8').trim();

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request({
      hostname: '127.0.0.1', port: 17456, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 30000,
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

(async () => {
  let r = await post(`/api/projects/${encodeURIComponent(id)}/conversations`, { sessionMode: 'design' });
  console.log('CONV:', r.status, r.body.slice(0, 220));
  let conv = null;
  try { conv = JSON.parse(r.body).conversation || JSON.parse(r.body); } catch {}
  const cid = conv && conv.id;

  r = await post('/api/runs', { projectId: id, conversationId: cid, prompt });
  console.log('RUN:', r.status, r.body.slice(0, 600));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
