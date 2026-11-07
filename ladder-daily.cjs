#!/usr/bin/env node
// ladder-daily.cjs — free-ladder.log 按天流量分析(补 model-sentinel v1「全量口径非按天」的已知局限)
//
// 真源:sandbox/dsh-home/free-ladder.log,行格式 = 24 字符 ISO 时间戳 + 空格 + JSON。
// 日界语义:**本地日**(默认机器时区;--tz 可指定分钟偏移,如 480=UTC+8)——日志是 Z 时间,
// 直接按 UTC 分组会把本地晚 8 点后的流量记到"昨天",对夜跑基准是毒药。
//
// 用法:
//   node ladder-daily.cjs                 人读表格
//   node ladder-daily.cjs --json          机器输出(供审计/基准)
//   node ladder-daily.cjs --from 2026-11-01 --to 2026-11-07   含边界过滤
//   node ladder-daily.cjs --log <path>    指定日志路径(默认工地家)
//
// 验收:test-ladder-daily.cjs —— 全量口径必须与 model-sentinel.cjs(独立解析器)对账全等。
'use strict';
const fs = require('node:fs');

const DEFAULT_LOG = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log';

/* 时间戳 → 本地日字符串。tzOffsetMin=本地相对 UTC 的分钟偏移(480=UTC+8);缺省=运行机器时区 */
function dayOf(ts, tzOffsetMin = -new Date().getTimezoneOffset()) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + tzOffsetMin * 60000).toISOString().slice(0, 10);
}

const blankDay = (date) => ({
  date, events: 0, rotate: 0, quota: 0, rateLimit: 0, override: 0,
  paidSwitch: 0, exhaust: 0, saw: 0, sessions: new Set(),
});

/* 纯函数:行数组 → 按天+总量统计(单测见 test-ladder-daily.cjs) */
function analyze(lines, { tzOffsetMin, from, to } = {}) {
  const tz = tzOffsetMin != null ? tzOffsetMin : -new Date().getTimezoneOffset();
  const days = new Map();
  const models = new Map();
  const totals = blankDay('TOTAL');
  let parseErrors = 0, blank = 0;

  for (const raw of lines) {
    if (!raw || !raw.trim()) { blank++; continue; }
    if (raw.length < 25) { parseErrors++; continue; }
    const date = dayOf(raw.slice(0, 24), tz);
    if (!date) { parseErrors++; continue; }
    let ev;
    try { ev = JSON.parse(raw.slice(25)); } catch { parseErrors++; continue; }
    if (!ev || typeof ev !== 'object' || !ev.ev) { parseErrors++; continue; }
    if (from && date < from) continue;
    if (to && date > to) continue;

    const day = days.get(date) || blankDay(date);
    days.set(date, day);
    day.events++; totals.events++;

    if (ev.ev === 'rotate') {
      day.rotate++; totals.rotate++;
      if (ev.code === 'QUOTA') { day.quota++; totals.quota++; }
      else if (ev.code === 'RATE_LIMIT') { day.rateLimit++; totals.rateLimit++; }
    } else if (ev.ev === 'req_route_override') {
      day.override++; totals.override++;
    } else if (ev.ev === 'paid_switch') {
      day.paidSwitch++; totals.paidSwitch++;
    } else if (ev.ev === 'exhaust') {
      day.exhaust++; totals.exhaust++;
    } else if (ev.ev === 'saw') {
      day.saw++; totals.saw++;
    } else if (ev.ev === 'req_seed' && ev.provider && ev.model) {
      const id = ev.provider + '/' + ev.model;
      models.set(id, (models.get(id) || 0) + 1);
    }
    if (ev.sessionId) { day.sessions.add(ev.sessionId); totals.sessions.add(ev.sessionId); }
  }

  const serialize = (d) => ({ ...d, sessions: d.sessions.size });
  const dayArr = [...days.values()].sort((a, b) => a.date < b.date ? -1 : 1).map(serialize);
  const modelArr = [...models.entries()].map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);
  return {
    parseErrors, blank,
    days: dayArr,
    totals: { ...serialize(totals) },
    models: modelArr,
    topModel: modelArr[0] || null,
  };
}

/* 每日 topModel:从 req_seed 按天聚合(analyze 只出全局 models,这里补按天维) */
function topModelByDay(lines, tzOffsetMin) {
  const tz = tzOffsetMin != null ? tzOffsetMin : -new Date().getTimezoneOffset();
  const per = new Map();
  for (const raw of lines) {
    if (!raw || raw.length < 25) continue;
    let ev; try { ev = JSON.parse(raw.slice(25)); } catch { continue; }
    if (!ev || ev.ev !== 'req_seed' || !ev.provider || !ev.model) continue;
    const date = dayOf(raw.slice(0, 24), tz);
    if (!date) continue;
    const m = per.get(date) || new Map();
    const id = ev.provider + '/' + ev.model;
    m.set(id, (m.get(id) || 0) + 1);
    per.set(date, m);
  }
  const out = new Map();
  for (const [date, m] of per) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(date, { model: top[0], count: top[1] });
  }
  return out;
}

function fmtTable(r, topByDay) {
  const pad = (s, n) => String(s).padEnd(n);
  const head = pad('日期', 12) + pad('事件', 6) + pad('rotate', 8) + pad('QUOTA', 7) + pad('RATELIM', 9) + pad('override', 10) + pad('exhaust', 9) + pad('paid', 6) + pad('会话', 6) + '当日主力模型';
  const rows = r.days.map((d) => {
    const tm = topByDay.get(d.date);
    return pad(d.date, 12) + pad(d.events, 6) + pad(d.rotate, 8) + pad(d.quota, 7) + pad(d.rateLimit, 9) + pad(d.override, 10) + pad(d.exhaust, 9) + pad(d.paidSwitch, 6) + pad(d.sessions, 6) + (tm ? `${tm.model} ×${tm.count}` : '-');
  });
  const t = r.totals;
  const total = pad('TOTAL', 12) + pad(t.events, 6) + pad(t.rotate, 8) + pad(t.quota, 7) + pad(t.rateLimit, 9) + pad(t.override, 10) + pad(t.exhaust, 9) + pad(t.paidSwitch, 6) + pad(t.sessions, 6) + (r.topModel ? `${r.topModel.model} ×${r.topModel.count}` : '-');
  return [head, '-'.repeat(head.length), ...rows, '-'.repeat(head.length), total].join('\n')
    + `\n\nparseErrors=${r.parseErrors} blankLines=${r.blank}`;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k) => args.includes(k) ? args[args.indexOf(k) + 1] : null;
  const logPath = get('--log') || DEFAULT_LOG;
  const from = get('--from'), to = get('--to');
  const lines = fs.readFileSync(logPath, 'utf8').split('\n');
  const r = analyze(lines, { from: from || undefined, to: to || undefined });
  if (args.includes('--json')) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(), log: logPath,
      tz: 'local(' + -new Date().getTimezoneOffset() + 'min)',
      from: from || null, to: to || null,
      totals: r.totals, days: r.days, models: r.models.slice(0, 12),
      parseErrors: r.parseErrors, blank: r.blank,
    }, null, 2));
  } else {
    console.log('ladder-daily — ' + logPath + (from || to ? ` (窗口 ${from || '…'} ~ ${to || '…'})` : ''));
    console.log(fmtTable(r, topModelByDay(lines, undefined)));
  }
  process.exitCode = r.parseErrors > 0 ? 0 : 0; // 解析错不失败,如实展示;真验收在测试里
}

module.exports = { analyze, dayOf, topModelByDay };
if (require.main === module) main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
