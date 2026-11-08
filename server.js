/* ============================================================
 * 贾维斯 · 实时对话服务 (零依赖, Node 原生)
 * 静态托管 public/  +  /api/chat 对话端点
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 65536) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', () => resolve(''));
  });
}

/* 本地贾维斯风格回复（可后续接外部 API） */
function localJarvisReply(message) {
  const m = String(message || '').trim();
  if (!m) return '请说明你要做什么。';
  if (/(帮忙|帮我|能不能|可以)/i.test(m)) return '可以。直接说具体动作或目标。';
  if (/(状态|怎么样|现在)/i.test(m)) return '当前处于对话就绪状态。需要我做什么？';
  if (/(打开|点击|输入|操作)/i.test(m)) return '收到。对话层已就绪，执行层（CUA）可后续对接。先说具体步骤。';
  return `收到：「${m.slice(0, 80)}」。我在。继续说。`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/chat' && req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
    const message = String(body.message || '').slice(0, 2000);
    const reply = localJarvisReply(message);
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ reply, ts: Date.now() }));
    return;
  }

  /* 静态文件 */
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log('  贾维斯 · 实时对话  ONLINE');
  console.log(`  http://localhost:${PORT}`);
  console.log('==============================================');
});
