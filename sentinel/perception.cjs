'use strict';
/* ============================================================
 * 哨兵 · 感知层 (手册§5: 把嘈杂的本机信号变成少量、干净、可判断的事件)
 * 过滤规则按序执行: 1节流去重 2聚合 3紧急旁路 4脱敏 5统一格式
 * 脱敏: 文件只取"路径名+存在性", 不读取内容 (原始内容不出本机目录)
 * ============================================================ */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let evSeq = 0;
function mkEvent(source, type, value, context, priority) {
  return {
    id: `evt_${String(++evSeq).padStart(4, '0')}`,
    time: new Date().toISOString(),
    source: String(source).slice(0, 40),
    type: String(type).slice(0, 32),
    value,
    context: context || {},
    priority: priority === 'urgent' ? 'urgent' : 'normal',
  };
}

class Perception {
  constructor(cfg) {
    this.cfg = cfg;
    this.lastSeen = new Map();   // dedupe key -> ts
    this.suppressed = 0;
    this.fileBuf = new Map();    // path -> ts (fs.watch 事件缓冲)
    this.watchers = [];
    this.batteryCache = { at: 0, data: null };
    this.startWatchers();
  }

  /* ---- 文件监听 (手册§5事件源; 只记名字, 脱敏) ---- */
  startWatchers() {
    const excl = new RegExp(this.cfg.watchExcludes || '$^', 'i');
    for (const dir of this.cfg.watchDirs || []) {
      try {
        if (!fs.existsSync(dir)) continue;
        const w = fs.watch(dir, { recursive: true }, (event, filename) => {
          if (!filename) return;
          const p = path.join(dir, filename).replace(/\\/g, '/');
          if (/node_modules|\.db|\.log$/i.test(p)) return;
          if (excl.test(p)) return; /* 自产文件(注册表/报告/库)不算外界信号, 防自激 */
          this.fileBuf.set(p, Date.now());
          if (this.fileBuf.size > 60) {
            const oldest = [...this.fileBuf.entries()].sort((a, b) => a[1] - b[1])[0];
            if (oldest) this.fileBuf.delete(oldest[0]);
          }
        });
        w.on('error', () => { try { w.close(); } catch { /* 忽略 */ } });
        this.watchers.push(w);
      } catch { /* 目录不可监听则跳过 */ }
    }
  }

  /* ---- 模型池健康情报 (本地文件, 零 API 成本) ---- */
  poolStatus() {
    const cfg = this.cfg.pool || {};
    const home = cfg.dshHome;
    if (!home) return null;
    const out = { cooling: [], today: { quota: 0, rateLimit: 0, total: 0 }, source: home.replace(/\\/g, '/') };
    try {
      const h = JSON.parse(fs.readFileSync(path.join(home, 'free-ladder-health.json'), 'utf8'));
      const now = Date.now();
      for (const [model, info] of Object.entries(h || {})) {
        const until = Number(info && info.cooldownUntil) || 0;
        if (until > now) out.cooling.push({ model, minLeft: Math.round((until - now) / 60000) });
      }
      out.cooling.sort((a, b) => b.minLeft - a.minLeft);
    } catch { /* 无文件=池健康文件不存在, 如实返回空 */ }
    try {
      const fd = fs.openSync(path.join(home, 'free-ladder.log'), 'r');
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, cfg.logTailBytes || 262144);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      fs.closeSync(fd);
      const today = new Date();
      const dstr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      for (const line of buf.toString('utf8').split('\n')) {
        /* 时间在行首 ISO(截前24字符), Z 时间按本地日归属 */
        if (line.length < 24) continue;
        let d; try { d = new Date(line.slice(0, 24)); } catch { continue; }
        if (isNaN(d) || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` !== dstr) continue;
        if (/QUOTA/.test(line)) out.today.quota++;
        else if (/RATE_LIMIT/.test(line)) out.today.rateLimit++;
      }
      out.today.total = out.today.quota + out.today.rateLimit;
    } catch { /* 日志缺失则只有冷却情报 */ }
    return out;
  }

  /* ---- 趋势计算 (最小二乘, x=小时, y=磁盘剩余%) ---- */
  static trendFrom(samples) {
    if (!samples || samples.length < 6) return null;
    const t0 = new Date(samples[0].ts).getTime();
    const pts = samples
      .map((s) => [(new Date(s.ts).getTime() - t0) / 3600000, Number(s.disk_free_min)])
      .filter((p) => Number.isFinite(p[1]));
    if (pts.length < 6) return null;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    if (den <= 0) return null;
    const slope = num / den; // %/小时
    return {
      slopePerHour: Math.round(slope * 1000) / 1000,
      spanHours: Math.round(pts[pts.length - 1][0] * 10) / 10,
      projected24h: Math.round((my + slope * (24 - mx)) * 10) / 10,
    };
  }

  drainFileChanges() {
    const now = Date.now();
    const fresh = [];
    for (const [p, ts] of this.fileBuf) if (now - ts < 10 * 60 * 1000) fresh.push({ p, ts });
    this.fileBuf.clear();
    fresh.sort((a, b) => a.ts - b.ts);
    return fresh.slice(-12); // 最多12条, 最小化
  }

  /* ---- 服务探活 (L0 只读) ---- */
  probe(url) {
    return new Promise((resolve) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const started = Date.now();
      fetch(url, { signal: ctrl.signal })
        .then((r) => { clearTimeout(t); resolve({ up: r.status < 500, status: r.status, ms: Date.now() - started }); })
        .catch(() => { clearTimeout(t); resolve({ up: false, status: 0, ms: Date.now() - started }); });
    });
  }

  /* ---- 电池 (可选; 台式机无电池则跳过) ---- */
  battery() {
    if (Date.now() - this.batteryCache.at < 5 * 60 * 1000) return Promise.resolve(this.batteryCache.data);
    return new Promise((resolve) => {
      execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          'Get-CimInstance Win32_Battery | ForEach-Object { "$($_.EstimatedChargeRemaining)|$($_.BatteryStatus)" }'],
        { timeout: 6000, windowsHide: true },
        (err, stdout) => {
          const line = String(stdout || '').split(/\r?\n/).find((s) => s.includes('|'));
          if (err || !line) { this.batteryCache = { at: Date.now(), data: null }; return resolve(null); }
          const [pct, st] = line.split('|');
          const data = { pct: Number(pct) || 0, charging: Number(st) === 2 || Number(st) >= 6 };
          this.batteryCache = { at: Date.now(), data };
          resolve(data);
        });
    });
  }

  /* ---- 节流去重 ---- */
  dedupe(events) {
    const win = (this.cfg.dedupeWindowMin || 10) * 60 * 1000;
    const out = [];
    for (const e of events) {
      const key = `${e.source}|${e.type}|${e.value}`;
      const last = this.lastSeen.get(key) || 0;
      if (Date.now() - last < win) { this.suppressed++; continue; }
      this.lastSeen.set(key, Date.now());
      out.push(e);
    }
    if (this.lastSeen.size > 200) {
      for (const [k, ts] of this.lastSeen) if (Date.now() - ts > 60 * 60 * 1000) this.lastSeen.delete(k);
    }
    return out;
  }

  /* ---- 采集一轮 (全部 L0 只读) ---- */
  async collect(collectMetrics) {
    const [metrics, probes, battery] = await Promise.all([
      Promise.resolve().then(collectMetrics).catch(() => null),
      Promise.all(Object.entries(this.cfg.probes || {}).map(async ([name, url]) => [name, await this.probe(url)])),
      this.battery(),
    ]);
    const th = this.cfg.thresholds || {};
    const raw = [];

    if (metrics) {
      if (metrics.cpu.avgPct >= (th.cpuPct || 90)) {
        raw.push(mkEvent('os', 'cpu_high', metrics.cpu.avgPct + '%', { cores: metrics.sys.cores }, 'normal'));
      }
      if (metrics.mem.pct >= (th.memPct || 92)) {
        raw.push(mkEvent('os', 'mem_high', metrics.mem.pct + '%', { usedGB: metrics.mem.usedGB }, 'normal'));
      }
      for (const d of metrics.disks) {
        if (d.totalGB > 0 && (100 - d.pct) <= (th.diskFreePct || 8)) {
          raw.push(mkEvent('os', 'disk_low', `${d.drive} 剩余${(100 - d.pct).toFixed(1)}%`, { freeGB: d.freeGB }, 'urgent'));
        }
      }
    }
    for (const [name, p] of probes) {
      if (!p.up) raw.push(mkEvent('probe', 'service_down', name, { status: p.status, ms: p.ms }, 'urgent'));
    }
    if (battery && !battery.charging && battery.pct <= (th.batteryPct || 15)) {
      raw.push(mkEvent('os', 'battery_low', battery.pct + '%', { charging: battery.charging }, 'urgent'));
    }
    const fileChanges = this.drainFileChanges();
    if (fileChanges.length >= 3) {
      raw.push(mkEvent('fs', 'file_change', `${fileChanges.length} 个文件变动`,
        { latest: fileChanges.slice(-3).map((f) => path.basename(f.p)) }, 'normal'));
    }

    const events = this.dedupe(raw);
    /* 聚合: 多个探活全挂 -> 一条"本地服务面失联" */
    const downs = events.filter((e) => e.type === 'service_down');
    if (downs.length >= 2) {
      const names = downs.map((e) => e.value);
      const rest = events.filter((e) => e.type !== 'service_down');
      rest.push(mkEvent('probe', 'services_down', names.join('+'), { count: names.length }, 'urgent'));
      return { metrics, probes, battery, events: rest, fileChanges, suppressed: this.suppressed };
    }
    return { metrics, probes, battery, events, fileChanges, suppressed: this.suppressed };
  }
}

module.exports = { Perception, mkEvent };
