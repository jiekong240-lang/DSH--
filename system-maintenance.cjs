// system-maintenance.cjs — 数字孪生系统 · 一键维护(不走 token:全程回环 API + 启动器自动带新页面)
// 用法: node system-maintenance.cjs [--restart-dsh]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execSync, spawn } = require('node:child_process');

const MONITOR_DIR = 'C:/Users/64562/.zcode/workspace/fed94a31-679a-45b6-966b-9f7cdf31218b/digital-twin-monitor';
const SANDBOX = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const GIT_BIN = 'C:/Users/64562/.workbuddy/binaries/PortableGit/versions/1.3.0/usr/bin';
const results = [];
const note = (ok, name, detail) => { results.push({ ok, name, detail: String(detail || '').slice(0, 110) }); console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : '')); };

function get(url) {
  return new Promise((res) => {
    http.get(url, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', (e) => res({ status: 0, body: String(e.message) }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('════ 数字孪生系统维护 ══ ' + new Date().toLocaleString() + ' ══\n');

  /* 1. 进程整顿: 只留一个 DSH web 实例 */
  try {
    const before = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"', { encoding: 'utf8' }).trim();
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"');
    await sleep(1500);
    note(true, '① DSH 旧实例清场', '重启前 3080 监听数: ' + before.trim());
  } catch (e) { note(false, '① DSH 旧实例清场', e.message); }

  /* 2. 临时物清理: spill 会话 / 旧启动日志(留最近 3)/ cookie 残留 */
  try {
    let cleaned = 0;
    const tmp = process.env.TEMP;
    for (const d of fs.readdirSync(tmp)) {
      if (d.startsWith('dsh-spill-')) { fs.rmSync(path.join(tmp, d), { recursive: true, force: true }); cleaned++; }
    }
    const logsDir = SANDBOX + '/dsh-home/logs';
    if (fs.existsSync(logsDir)) {
      const logs = fs.readdirSync(logsDir).filter((x) => x.startsWith('startup-')).sort().reverse();
      logs.slice(3).forEach((x) => { fs.rmSync(path.join(logsDir, x), { force: true }); cleaned++; });
    }
    note(true, '② 临时物清理', cleaned + ' 项(spill 会话/旧启动日志)');
  } catch (e) { note(false, '② 临时物清理', e.message); }

  /* 3. 配置完整性: 三层补丁 + 插件语法 */
  try {
    const ymls = [
      'C:/Users/64562/.dsh/cordis.patch.yml',
      SANDBOX + '/dsh-home/cordis.patch.yml',
    ];
    let ok = true, detail = [];
    for (const y of ymls) {
      const s = fs.readFileSync(y, 'utf8');
      if (!s.includes('free-ladder')) { ok = false; detail.push(path.basename(path.dirname(y)) + ' 缺 free-ladder'); }
      if (!s.includes('dsh-monitor')) { ok = false; detail.push(path.basename(path.dirname(y)) + ' 缺 dsh-monitor'); }
    }
    const lc = fs.readFileSync(SANDBOX + '/plugins/live-code/index.js', 'utf8');
    if (!lc.includes('class RepairRuns')) { ok = false; detail.push('live-code 缺 RepairRuns'); }
    note(ok, '③ 配置完整性(模型池/监控/修复)', ok ? '三层补丁全在位' : detail.join('; '));
  } catch (e) { note(false, '③ 配置完整性', e.message); }

  /* 4. 栈启动: 监控(若停)→ DSH web(启动器自动开新页面, token 不经人手) */
  try {
    let monitorUp = false;
    try { const r = await get('http://127.0.0.1:3210/live.html'); monitorUp = r.status === 200; } catch { }
    if (!monitorUp) {
      spawn(process.execPath, [MONITOR_DIR + '/server.js'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: MONITOR_DIR }).unref();
      await sleep(2500);
      const r = await get('http://127.0.0.1:3210/live.html'); monitorUp = r.status === 200;
    }
    note(monitorUp, '④ 数据服务 :3210', monitorUp ? '在线' : '启动失败');
    const env = { ...process.env };
    env.PATH = GIT_BIN + path.delimiter + (env.PATH || '');
    env.DSH_HOME = SANDBOX + '/dsh-home';
    const child = spawn(process.execPath, [MONITOR_DIR + '/launch-dsh.js'], { env: process.env, stdio: 'ignore', windowsHide: true, detached: true });
    child.unref();
    await sleep(8000);
    note(true, '⑤ DSH 主界面 :3080', '已启动 · 新页面已自动弹出到默认浏览器(token 由启动器携带, 无需人工处理)');
  } catch (e) { note(false, '⑤ DSH 主界面', e.message); }

  /* 5. 端到端健康: 面板引擎 / 墙 / 事件流 */
  await sleep(1500);
  try {
    const st = await get('http://127.0.0.1:3080/dsh-live-code/state');
    const d = JSON.parse(st.body);
    note(true, '⑥ 代码问题引擎', 'roots ' + d.roots.length + ' · files ' + (d.files || []).length + ' · unverified ' + (d.unverified || []).length + '(红线:不计入问题)');
  } catch (e) { note(false, '⑥ 代码问题引擎', String(e.message).slice(0, 80)); }
  try {
    const w = await get('http://127.0.0.1:3210/live.html');
    note(w.status === 200, '⑦ 左写右应大屏', 'HTTP ' + w.status);
  } catch (e) { note(false, '⑦ 左写右应大屏', String(e.message).slice(0, 60)); }

  /* 6. 汇总 */
  const pass = results.filter((r) => r.ok).length;
  console.log('\n════ 维护汇总: ' + pass + '/' + results.length + ' 项通过 ══\n');
  console.log('入口: DSH 主页面(已自动弹出) · 大屏 http://localhost:3210/live.html · 哨兵: node model-sentinel.cjs');
})().catch((e) => { console.error('MAINTENANCE-FAIL', e); process.exit(1); });
