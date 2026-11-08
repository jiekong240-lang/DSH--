/* ============================================================
 * 数字孪生 · 本地监控中枢 — 数据服务 (零依赖, Node 原生)
 * 静态托管 public/  +  /api/metrics 本机指标采集
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------------- CPU 采样 (两次调用差值) ---------------- */
let lastCpus = os.cpus();

function sampleCpu() {
  const now = os.cpus();
  const cores = now.map((c, i) => {
    const p = lastCpus[i] || c;
    const d = (k) => Math.max(0, c.times[k] - p.times[k]);
    const idle = d('idle');
    const total = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    return total > 0 ? Math.min(100, Math.max(0, (1 - idle / total) * 100)) : 0;
  });
  lastCpus = now;
  const avg = cores.length ? cores.reduce((a, b) => a + b, 0) / cores.length : 0;
  return {
    coresPct: cores.map((v) => Math.round(v * 10) / 10),
    avgPct: Math.round(avg * 10) / 10,
    speedMhz: now[0] ? Math.round(now[0].speed) : 0,
  };
}

/* ---------------- PowerShell 辅助 ---------------- */
function ps(command, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout, windowsHide: true },
      (err, stdout) => resolve(err ? '' : String(stdout || ''))
    );
  });
}
const parseLines = (out) =>
  String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/* ---------------- 磁盘 ---------------- */
async function sampleDisks() {
  const out = await ps(
    "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { \"$($_.DeviceID)|$($_.Size)|$($_.FreeSpace)\" }"
  );
  return parseLines(out)
    .map((line) => {
      const [drive, size, free] = line.split('|');
      const total = Number(size) || 0;
      const freeB = Number(free) || 0;
      const used = Math.max(0, total - freeB);
      return {
        drive,
        totalGB: +(total / 2 ** 30).toFixed(1),
        usedGB: +(used / 2 ** 30).toFixed(1),
        freeGB: +(freeB / 2 ** 30).toFixed(1),
        pct: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      };
    })
    .filter((d) => d.totalGB > 0);
}

/* ---------------- 网络 (累计字节差值 -> 速率) ---------------- */
let lastNet = null;
async function sampleNet() {
  const out = await ps(
    'Get-NetAdapterStatistics | ForEach-Object { "$($_.ReceivedBytes)|$($_.SentBytes)" }'
  );
  const t = Date.now();
  let rx = 0, tx = 0;
  for (const line of parseLines(out)) {
    const [r, s] = line.split('|');
    rx += Number(r) || 0;
    tx += Number(s) || 0;
  }
  let rxBps = 0, txBps = 0;
  if (lastNet) {
    const dt = Math.max(1, (t - lastNet.t) / 1000);
    rxBps = Math.max(0, (rx - lastNet.rx) / dt);
    txBps = Math.max(0, (tx - lastNet.tx) / dt);
  }
  lastNet = { rx, tx, t };
  return { rxBps: Math.round(rxBps), txBps: Math.round(txBps), rxTotal: rx, txTotal: tx };
}

/* ---------------- GPU (只需取一次) ---------------- */
let gpuName = '';
async function sampleGpu() {
  const out = await ps('Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }');
  gpuName = parseLines(out).filter((n) => n && n.length < 120).join(' + ') || '未知设备';
  return gpuName;
}

/* ---------------- 汇总 ---------------- */
function netIps() {
  const res = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) res.push(`${a.address}(${name})`);
  }
  return res;
}

async function collectMetrics() {
  const cpu = sampleCpu();
  const [disks, net] = await Promise.all([sampleDisks(), sampleNet()]);
  if (!gpuName) await sampleGpu();
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    ts: Date.now(),
    sys: {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: (os.cpus()[0] && os.cpus()[0].model.trim()) || 'Unknown CPU',
      cores: os.cpus().length,
      uptimeSec: Math.round(os.uptime()),
      gpu: gpuName,
      ips: netIps(),
      nodeVersion: process.version,
    },
    cpu,
    mem: {
      totalGB: +(total / 2 ** 30).toFixed(2),
      usedGB: +(used / 2 ** 30).toFixed(2),
      freeGB: +(free / 2 ** 30).toFixed(2),
      pct: Math.round((used / total) * 1000) / 10,
    },
    disks,
    net,
  };
}

/* 5s 内的请求直接返回缓存, 避免重复拉起 PowerShell */
let cache = { at: 0, data: null };
let inflight = null;
function getMetrics() {
  if (cache.data && Date.now() - cache.at < 5000) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = collectMetrics()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/* ---------------- 编码活动事件流 (DSH / ZCODE 智能体 -> 大屏) ---------------- */
const EVENT_MAX = 200;
const eventBuf = [];
let eventSeq = 0;
const sseClients = new Set();
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function broadcast(payload) {
  for (const res of sseClients) {
    if (res.destroyed || res.writableEnded) { sseClients.delete(res); continue; }
    try { res.write(`data: ${payload}\n\n`); } catch { sseClients.delete(res); }
  }
}
setInterval(() => broadcast(': ping'), 25000).unref();

/* 哨兵专用事件通道: 与 /api/event 同缓冲, 供编码活动流/大屏 SSE 复用 */
function ingestEvent(e) {
  eventBuf.push(e);
  if (eventBuf.length > EVENT_MAX) eventBuf.shift();
  broadcast(JSON.stringify({ type: 'event', event: e }));
}

/* 监控服务必须常驻: 任何意外异常记日志后继续运行 */
process.on('uncaughtException', (e) => console.error('[monitor] uncaught:', String(e && e.stack || e)));
process.on('unhandledRejection', (e) => console.error('[monitor] rejection:', String(e && e.stack || e)));
function countEvents() {
  /* null 原型: 防止恶意 kind(如 "constructor")命中 Object 原型键 */
  const c = Object.assign(Object.create(null), { code: 0, exec: 0, scan: 0, error: 0, task: 0, other: 0 });
  for (const e of eventBuf) if (e.kind in c) c[e.kind]++; else c.other++;
  return c;
}

/* ---------------- 文件注册表 (代码城市数据源) ---------------- */
const fileRegistry = new Map();
let registrySaveTimer = null;
const REGISTRY_FILE = path.join(__dirname, 'state', 'file-registry.json');

function registerFile(rawPath, cwd) {
  try {
    let p = String(rawPath || '').trim();
    if (!p || p.length < 2 || p.length > 400) return null;
    /* 带空格的 target 只有真实存在才认作路径 (排除命令片段) */
    if (/\s/.test(p)) {
      let probe = p;
      if (!path.isAbsolute(probe) && cwd) probe = path.join(String(cwd), probe);
      if (!fs.existsSync(probe)) return null;
    }
    let abs = p;
    if (!path.isAbsolute(p) && cwd) abs = path.join(String(cwd), p);
    abs = path.normalize(abs);
    const key = abs.replace(/\\/g, '/');
    let f = fileRegistry.get(key);
    if (!f) {
      f = { key, name: path.basename(key) || key, dir: path.dirname(key), edits: 0, lastTs: 0, bytes: 0, exists: false };
      fileRegistry.set(key, f);
      if (fileRegistry.size > 300) {
        let oldest = null, oldTs = Infinity;
        for (const x of fileRegistry.values()) if ((x.lastTs || 0) < oldTs) { oldTs = x.lastTs || 0; oldest = x; }
        if (oldest) fileRegistry.delete(oldest.key);
      }
    }
    f.edits++;
    f.lastTs = Date.now();
    try {
      const st = fs.statSync(abs);
      if (st.isFile()) { f.bytes = st.size; f.exists = true; }
      else f.exists = false;
    } catch { f.exists = false; }
    scheduleRegistrySave();
    return { key: f.key, name: f.name, dir: f.dir, edits: f.edits, lastTs: f.lastTs, bytes: f.bytes, exists: f.exists };
  } catch { return null; }
}

function scheduleRegistrySave() {
  if (registrySaveTimer) return;
  registrySaveTimer = setTimeout(() => {
    registrySaveTimer = null;
    try {
      fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ files: [...fileRegistry.values()] }));
    } catch { /* 持久化失败不影响运行 */ }
  }, 1500);
  if (registrySaveTimer.unref) registrySaveTimer.unref();
}

/* 启动时扫描项目目录, 让城市有初始地貌 */
function seedScan() {
  const skip = new Set(['node_modules', '.git', 'state']);
  const walk = (dir, depth) => {
    if (depth > 2) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        const key = full.replace(/\\/g, '/');
        if (!fileRegistry.has(key)) {
          fileRegistry.set(key, {
            key, name: e.name, dir: path.dirname(key),
            edits: 0, lastTs: st.mtimeMs, bytes: st.size, exists: true,
          });
        }
      } catch { /* 忽略不可读项 */ }
    }
  };
  walk(__dirname, 0);
}

function loadRegistry() {
  try {
    const d = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    for (const f of (d && d.files) || []) if (f && f.key) fileRegistry.set(f.key, f);
  } catch { /* 首次运行无持久化文件 */ }
}

/* ---------------- HTTP 服务 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/metrics') {
    try {
      const data = await getMetrics();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
    return;
  }

  /* ---- 编码活动: 事件上报 / 历史 / SSE 实时流 ---- */
  if (url.pathname === '/api/event' && req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS); res.end(); return;
  }
  if (url.pathname === '/api/event' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}');
        const e = {
          seq: ++eventSeq,
          ts: (b.ts === undefined || b.ts === null || b.ts === '') ? Date.now() : Number(b.ts),
          source: String(b.source || 'external').slice(0, 16),
          kind: String(b.kind || 'tool').slice(0, 16),
          tool: String(b.tool || '').slice(0, 40),
          target: String(b.target || '').slice(0, 140),
          status: String(b.status || 'ok').slice(0, 16),
        };
        /* 写码事件 -> 登记文件 + 捕获真实代码 diff, 供大屏展示 */
        let fi = null;
        if (e.kind === 'code') {
          fi = registerFile(b.target, b.cwd);
          if (fi) e.file = fi;
        }
        if (b.diff && typeof b.diff === 'object') {
          e.diff = {
            del: String(b.diff.del || '').slice(0, 1200),
            ins: String(b.diff.ins || '').slice(0, 1200),
          };
          if (fi) fi.lastDiff = e.diff;
        }
        eventBuf.push(e);
        if (eventBuf.length > EVENT_MAX) eventBuf.shift();
        broadcast(JSON.stringify({ type: 'event', event: e }));
      } catch { /* 脏数据直接丢弃, 不影响服务 */ }
      res.writeHead(204, CORS_HEADERS); res.end();
    });
    return;
  }
  if (url.pathname === '/api/events') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    // Validate: if either from/to is provided but not a valid number → 400
    if ((from !== null && isNaN(Number(from))) || (to !== null && isNaN(Number(to)))) {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'from/to must be valid epoch milliseconds' }));
      return;
    }
    const fromNum = from !== null ? Number(from) : null;
    const toNum = to !== null ? Number(to) : null;
    const filtered = eventBuf.filter((e) => {
      const ts = e.ts;
      if (fromNum !== null && ts < fromNum) return false;
      if (toNum !== null && ts > toNum) return false;
      return true;
    });
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ events: filtered, counts: countEvents() }));
    return;
  }
  if (url.pathname === '/api/files') {
    const files = [...fileRegistry.values()]
      .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      .slice(0, 60);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ files }));
    return;
  }
  /* 真实文件内容(仅限注册表内的文件, 截断 64KB) — 左屏"正在写"数据源 */
  if (url.pathname === '/api/file') {
    const key = url.searchParams.get('key') || '';
    const f = fileRegistry.get(key);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!f) { res.end(JSON.stringify({ error: 'unknown file' })); return; }
    let content = '';
    try { content = fs.readFileSync(f.key, 'utf8').slice(0, 65536); } catch { content = ''; }
    res.end(JSON.stringify({ key: f.key, name: f.name, bytes: f.bytes, exists: f.exists, edits: f.edits, content }));
    return;
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', ts: Date.now() })}\n\n`);
    res.on('error', () => sseClients.delete(res));
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  /* ---- 哨兵智能体: 状态 / 手动巡查 / 审计尾 (只读+手动触发, 无任何 L3 端点) ---- */
  if (url.pathname === '/api/sentinel/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    try { res.end(JSON.stringify(sentinel ? sentinel.publicState() : { state: 'OFF' })); }
    catch (e) { res.end(JSON.stringify({ state: 'ERROR', error: String((e && e.message) || e) })); }
    return;
  }
  if (url.pathname === '/api/sentinel/run' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!sentinel) { res.end(JSON.stringify({ error: 'sentinel off' })); return; }
    sentinel.manualRun()
      .then((r) => res.end(JSON.stringify(r)))
      .catch((e) => res.end(JSON.stringify({ error: String((e && e.message) || e) })));
    return;
  }
  if (url.pathname === '/api/sentinel/audit') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ lines: sentinel ? sentinel.audit.tail(80) : [] }));
    return;
  }
  /* L3 一次性批准: 仅接受本机回环请求 (手册§8确认机制: 写明动作/对象/时限, 超时视为拒绝, 不可复用) */
  if (url.pathname === '/api/sentinel/approve' && req.method === 'POST') {
    const ra = String(req.socket.remoteAddress || '');
    if (!/^(::1|127\.0\.0\.1)$/.test(ra)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '仅限本机批准' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      if (!sentinel) { res.end(JSON.stringify({ error: 'sentinel off' })); return; }
      try {
        const b = JSON.parse(body || '{}');
        res.end(JSON.stringify(sentinel.approve(Number(b.proposalId))));
      } catch (e) {
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      }
    });
    return;
  }

  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400); res.end(); return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

loadRegistry();
seedScan();

/* ---------------- 哨兵智能体 (手册§10 P1 影子模式: 只提案不执行) ----------------
 * 进程内调度 (综述§6"主动触发"备选): 随大屏服务常驻, 每 intervalSec 巡查一轮。
 * 任何哨兵故障只降级, 不影响指标服务本身。 */
let sentinel = null;
try {
  const { Sentinel } = require('./sentinel/sentinel.cjs');
  sentinel = new Sentinel().init({
    collectMetrics: () => getMetrics(),
    pushEvent: (e) => ingestEvent({
      seq: ++eventSeq, ts: e.ts || Date.now(), source: e.source || 'sentinel',
      kind: e.kind || 'task', tool: e.tool || '', target: e.target || '', status: e.status || 'ok',
    }),
    toast: (msg, urgent) => broadcast(JSON.stringify({ type: 'sentinel_toast', msg, urgent: !!urgent, ts: Date.now() })),
    onState: (s) => broadcast(JSON.stringify({ type: 'sentinel', s })),
  });
} catch (e) {
  console.error('[sentinel] init failed (监控服务继续运行):', String(e && e.stack || e));
}

server.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log('  数字孪生 · 本地监控中枢  DATA SERVICE ONLINE');
  console.log(`  http://localhost:${PORT}`);
  console.log('  数据同步周期: 180s (每3分钟)');
  console.log(`  哨兵智能体: ${sentinel ? `影子巡查 ${sentinel.cfg.intervalSec}s` : '未启用'}`);
  console.log('==============================================');
  getMetrics().catch(() => {});
});

/* Ctrl+C 优雅退出: 先关服务器再退出 */
process.on('SIGINT', () => {
  console.log('\n[monitor] SIGINT — closing server...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
