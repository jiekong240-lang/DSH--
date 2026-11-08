/* ============================================================
 * 贾维斯 · 实时对话服务
 * 静态托管 + /api/chat + CUDA 计算接口
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const CUDA_SCRIPT = path.join(__dirname, 'cuda', 'particle_sim.py');
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

function callCuda(args, stdinData = null) {
  return new Promise((resolve) => {
    const py = spawn('python', [CUDA_SCRIPT, ...args], { timeout: 8000 });
    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d; });
    py.stderr.on('data', (d) => { err += d; });
    py.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: err || `exit ${code}`, fallback: true });
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        resolve({ ok: false, error: 'parse failed', fallback: true });
      }
    });
    py.on('error', () => resolve({ ok: false, error: 'python not found', fallback: true }));
    if (stdinData) py.stdin.end(JSON.stringify(stdinData));
    else py.stdin.end();
  });
}

function localJarvisReply(message) {
  const m = String(message || '').trim().toLowerCase();
  let shape = null;
  let reply = `收到：「${message.slice(0, 80)}」。我在。继续说。`;

  if (/(哈里发|burj|khalifa|塔|大厦|建筑)/i.test(m)) {
    shape = 'tower';
    reply = '收到。正在用 CUDA 加速生成哈里发塔点云并堆积。';
  } else if (/(球|圆|星球|地球)/i.test(m)) {
    shape = 'sphere';
    reply = '收到。正在用 CUDA 加速生成球体点云。';
  } else if (/(帮忙|帮我|能不能|可以)/i.test(m)) {
    reply = '可以。直接说具体动作或目标。';
  } else if (/(状态|怎么样|现在)/i.test(m)) {
    reply = '当前处于对话就绪状态。CUDA 计算层已接入（可用时自动启用）。';
  }

  return { reply, shape };
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
    const result = localJarvisReply(message);
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ reply: result.reply, shape: result.shape, ts: Date.now() }));
    return;
  }

  /* CUDA 生成点云 */
  if (url.pathname === '/api/cuda/generate' && req.method === 'POST') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
    const shape = String(body.shape || 'tower');
    const n = Math.min(50000, Math.max(100, Number(body.n) || 2000));
    const result = await callCuda(['--mode', 'generate', '--shape', shape, '--n', String(n)]);
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result));
    return;
  }

  /* CUDA 粒子单步 */
  if (url.pathname === '/api/cuda/step' && req.method === 'POST') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
    const result = await callCuda(['--mode', 'step', '--steps', '1'], body);
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result));
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
  console.log('  贾维斯 · 实时对话 + CUDA 加速层  ONLINE');
  console.log(`  http://localhost:${PORT}`);
  console.log('  CUDA: python cuda/particle_sim.py (可用时自动启用)');
  console.log('==============================================');
});
