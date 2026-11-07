/* 临时脚本: 在 OpenDesign(daemon 17456) 创建监控项目并挂载内嵌大屏工件 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:17456';

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + p);
    const r = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
      timeout: 15000,
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(b); } catch { return b.slice(0, 400); } })() }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  /* 用法: node od-setup.js [已有项目id]  — 不传则新建项目 */
  const stamp = new Date().toISOString().slice(5, 16).replace('T', '-');
  let id = process.argv[2] || '';
  if (!id) {
    /* 1. 建项目 (daemon 要求客户端生成 od- 前缀的 slug id) */
    const rand = Math.random().toString(36).slice(2, 10);
    const name = `数字孪生·代码城市监控-${stamp}`;
    const pr = await req('POST', '/api/projects', { id: `od-dtw-${rand}`, name, skipDiscoveryBrief: true });
    console.log('CREATE-PROJECT', pr.status, JSON.stringify(pr.json).slice(0, 260));
    const proj = pr.json && (pr.json.project || pr.json);
    id = proj && proj.id;
    if (!id) { console.error('NO-PROJECT-ID'); process.exit(1); }
  }

  /* 2. 挂载内嵌大屏工件 (左写右应分屏版) */
  const html = fs.readFileSync(path.join(__dirname, 'public', 'live.html'), 'utf8');
  const fr = await req('POST', `/api/projects/${encodeURIComponent(id)}/files`, {
    name: 'digital-twin.html',
    content: html,
    encoding: 'utf8',
  });
  console.log('CREATE-ARTIFACT', fr.status, JSON.stringify(fr.json).slice(0, 260));

  /* 3. 校验可读 */
  const vr = await req('GET', `/api/projects/${encodeURIComponent(id)}/raw/digital-twin.html`);
  console.log('VERIFY', vr.status, 'bytes:', typeof vr.json === 'string' ? vr.json.length : JSON.stringify(vr.json).length);
  console.log('PROJECT-ID:', id);

  /* 4. 同步写 DSH present 交付物(稳定绝对路径, 供 DSH 技能 digital-twin 使用) */
  const deliverable = path.join(__dirname, 'dsh-deliverable.html');
  fs.copyFileSync(path.join(__dirname, 'public', 'live.html'), deliverable);
  console.log('DSH-DELIVERABLE:', deliverable);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
