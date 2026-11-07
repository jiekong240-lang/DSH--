#!/usr/bin/env node
// cua-lookout.cjs — CUA 瞭望哨:每 3 分钟查看一次全链状态(大屏 :3210 + DSH live-code :3080)
//
// 真源 = HTTP(大屏 /api/events + DSH /dsh-live-code/state 回环只读旁路);
// 截图只作佐证、不作判据(严禁假绿)。判定规则见 judge(),与 test-cua-lookout.cjs 对齐:
//   RED      = DSH 真实验证存在 failed(红灯文件或失败测试)
//   DEGRADED = 任一真源不可达(链路问题,不冒充代码问题)
//   GREEN    = 其余;unverified 一律不计入问题(与 engine.mjs snapshot 红线同源)
//
// 用法:
//   node cua-lookout.cjs --once [--shot monitor-records\lookout.png]   单次查看
//   node cua-lookout.cjs --watch [秒]                                  常驻瞭望(默认 180s)
// 环境变量 CUA_LOOKOUT_DASH / CUA_LOOKOUT_DSH 可覆盖端点。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const DASH = process.env.CUA_LOOKOUT_DASH || 'http://127.0.0.1:3210';
const DSH = process.env.CUA_LOOKOUT_DSH || 'http://127.0.0.1:3080';
const LIVE = DSH + '/dsh-live-code';
const RECORDS = path.join(__dirname, 'monitor-records', 'lookout.jsonl');
const CUA_TCP_PORT = 19333; // cua-daemon.cjs:MCP JSON-RPC(newline-delimited)

async function fetchJson(url, ms = 6000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/* 纯函数:合并两路真源 → 红绿判定(单测见 test-cua-lookout.cjs) */
function judge(dash, dsh, now = Date.now()) {
  const issues = [];
  const redFiles = [];
  const failedTests = [];
  const summary = { dashEvents: 0, dashErrors: 0, dshVerified: 0, dshUnverified: 0, dshRed: 0 };

  if (!dash || dash.ok === false) issues.push('dash:down:' + String((dash && dash.error) || '无数据'));
  else {
    summary.dashEvents = Array.isArray(dash.events) ? dash.events.length : 0;
    summary.dashErrors = Number((dash.counts && dash.counts.error) || 0);
  }
  if (!dsh || dsh.ok === false) issues.push('dsh:down:' + String((dsh && dsh.error) || '无数据'));
  else {
    for (const f of Array.isArray(dsh.files) ? dsh.files : []) {
      if (f && f.status === 'failed') redFiles.push(String(f.rel || f.id || '?'));
    }
    // externalTests 快照按 at 降序(externalSnapshot 同源):同文件只认最新一条——
    // 修复后的 passed 覆盖历史 failed,历史失败不再让大屏常红
    const latestByFile = new Map();
    for (const t of Array.isArray(dsh.externalTests) ? dsh.externalTests : []) {
      if (!t) continue;
      const k = String(t.file || '?');
      if (!latestByFile.has(k)) latestByFile.set(k, t);
    }
    for (const [file, t] of latestByFile) {
      if (t.status === 'failed') failedTests.push({ file, output: String(t.output || '').slice(-200) });
    }
    // DSH 内部测试运行:stale=true 表示源码已变、结果过期,不作为当前状态证据
    for (const r of Array.isArray(dsh.tests) ? dsh.tests : []) {
      if (r && r.status === 'failed' && !r.stale) failedTests.push({ file: String(r.file || r.id || 'run'), output: String(r.output || '').slice(-200) });
    }
    summary.dshVerified = Number(dsh.verifiedCount != null ? dsh.verifiedCount : (dsh.files || []).length);
    summary.dshUnverified = Number(dsh.unverifiedCount != null ? dsh.unverifiedCount : (dsh.unverified || []).length);
    summary.dshRed = redFiles.length;
    if (redFiles.length) issues.push('dsh:red-files:' + redFiles.join(','));
    if (failedTests.length) issues.push('dsh:test-failed:' + failedTests.map((t) => t.file).join(','));
  }

  const down = issues.some((i) => i.startsWith('dash:down') || i.startsWith('dsh:down'));
  const red = redFiles.length > 0 || failedTests.length > 0;
  const verdict = red ? 'RED' : down ? 'DEGRADED' : 'GREEN';
  return { verdict, ok: verdict === 'GREEN', issues, redFiles, failedTests, summary, at: now };
}

/* 采集两路真源;任一失败如实记 down,不吞异常 */
async function collect() {
  const [dash, dsh] = await Promise.allSettled([
    fetchJson(DASH + '/api/events'),
    fetchJson(LIVE + '/state'),
  ]);
  const pack = (r) => r.status === 'fulfilled'
    ? { ok: true, ...r.value }
    : { ok: false, error: String((r.reason && r.reason.message) || r.reason).slice(0, 120) };
  return { dash: pack(dash), dsh: pack(dsh) };
}

/* 账本:monitor-records/lookout.jsonl 逐笔追加,可审计 */
function appendRecord(rec) {
  fs.mkdirSync(path.dirname(RECORDS), { recursive: true });
  fs.appendFileSync(RECORDS, JSON.stringify(rec) + '\n');
}

/* 上屏:POST /api/event;失败静默(上屏不影响判定) */
async function report(event) {
  try {
    await fetch(DASH + '/api/event', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'CUA', ...event }),
    });
  } catch { /* 忽略 */ }
}

/* CUA 截图佐证(可选):MCP JSON-RPC over TCP 19333 → tools/list 挑截图工具 → 调用。
   失败如实返回 {shot:'unavailable:<原因>'},绝不伪造图片。 */
function cuaShot(outPng, ms = 20000) {
  return new Promise((resolve) => {
    let buf = '';
    let step = 0; // 0=initialize 1=initialized+tools/list 2=tools/call
    let shotTool = null;
    const sock = net.connect(CUA_TCP_PORT, '127.0.0.1');
    const done = (r) => { try { sock.destroy(); } catch {} resolve(r); };
    const timer = setTimeout(() => done({ shot: 'unavailable:timeout' }), ms);
    sock.on('error', (e) => { clearTimeout(timer); done({ shot: 'unavailable:' + (e.code || e.message) }); });
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (step === 0 && msg.id === 1) {
          step = 1;
          sock.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          sock.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        } else if (step === 1 && msg.id === 2) {
          const tools = (msg.result && msg.result.tools) || [];
          shotTool = tools.find((t) => /screenshot|desktop_state|look_screen/i.test(t.name))
            || tools.find((t) => /^see$|^clip$/i.test(t.name)); // task 档案复合工具:see(看屏)/clip(截屏)
          if (!shotTool) { clearTimeout(timer); return done({ shot: 'unavailable:no-shot-tool:' + tools.map((t) => t.name).slice(0, 6).join(',') }); }
          step = 2;
          sock.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: shotTool.name, arguments: {} } }) + '\n');
        } else if (step === 2 && msg.id === 3) {
          clearTimeout(timer);
          const img = msg.result && Array.isArray(msg.result.content) && msg.result.content.find((c) => c.type === 'image');
          if (img && img.data) {
            try {
              fs.mkdirSync(path.dirname(outPng), { recursive: true });
              fs.writeFileSync(outPng, Buffer.from(img.data, 'base64'));
              done({ shot: path.resolve(outPng), shotTool: shotTool.name, shotBytes: img.data.length });
            } catch (e) { done({ shot: 'unavailable:write:' + e.message.slice(0, 60) }); }
          } else {
            const txt = msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text;
            done({ shot: 'unavailable:' + String(txt || 'no image in response').slice(0, 80) });
          }
        }
      }
    });
    sock.on('connect', () => {
      sock.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cua-lookout', version: '1.0.0' } } }) + '\n');
    });
  });
}

/* 一轮瞭望:采集 → 判定 → 账本 → 上屏(scan 事件;RED 时追加 error 事件)。
   截图仅在红绿翻转(或首轮)时存证:常驻模式下每轮都存会日涨数百 MB */
let lastVerdict = null;
async function round({ shotPath = null } = {}) {
  const t0 = Date.now();
  const { dash, dsh } = await collect();
  const v = judge(dash, dsh, t0);
  if (shotPath && v.verdict !== lastVerdict) {
    Object.assign(v, await cuaShot(shotPath));
  } else if (shotPath) {
    v.shot = 'skipped:no-verdict-change';
  }
  lastVerdict = v.verdict;
  v.durationMs = Date.now() - t0;
  appendRecord(v);
  await report({ kind: 'scan', tool: 'cua-lookout', target: `verdict=${v.verdict} red=${v.redFiles.length} failedTests=${v.failedTests.length} verified=${v.summary.dshVerified}` });
  if (v.verdict === 'RED') await report({ kind: 'error', tool: 'cua-lookout', target: v.issues.join(' | ').slice(0, 140) });
  return v;
}

function fmtLine(v) {
  const s = v.summary;
  return `[${new Date(v.at).toTimeString().slice(0, 8)}] ${v.verdict} (events=${s.dashEvents} verified=${s.dshVerified} unverified=${s.dshUnverified} red=${s.dshRed} failedTests=${v.failedTests.length}) ${v.issues.join(' | ')}`;
}

async function main() {
  const args = process.argv.slice(2);
  const watchIdx = args.indexOf('--watch');
  const shotPath = args.includes('--shot') ? args[args.indexOf('--shot') + 1]
    : path.join(__dirname, 'monitor-records', 'lookout-' + Date.now() + '.png');

  if (watchIdx >= 0) {
    const sec = Math.max(30, Number(args[watchIdx + 1]) || 180);
    console.log(`cua-lookout: 常驻瞭望,每 ${sec}s 一轮,真源=${DASH} + ${LIVE},账本=${RECORDS}`);
    let stop = false;
    process.on('SIGINT', () => { stop = true; });
    while (!stop) {
      try { console.log(fmtLine(await round({ shotPath }))); }
      catch (e) { console.log('round error: ' + String(e.message || e)); }
      await new Promise((r) => setTimeout(r, sec * 1000));
    }
  } else {
    const v = await round({ shotPath });
    console.log(fmtLine(v));
    console.log(JSON.stringify(v, null, 2));
    process.exitCode = v.ok ? 0 : 2;
  }
}

module.exports = { judge, collect, round, cuaShot, RECORDS };
if (require.main === module) main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
