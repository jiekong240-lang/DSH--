#!/usr/bin/env node
// quota-probe.cjs — P0 配额探针主体(2026-11-07 拍板:动态排序、禁死档重试、零调用零花费)
//
// 真源(全部只读,零 API 调用):
//   1. sandbox/dsh-home/free-ladder.log —— free-ladder 插件 v1.2.1 逐笔事件(rotate/saw/req_seed/paid_switch/loaded)
//   2. sandbox/dsh-home/free-ladder-health.json —— 插件自记健康态(交叉对账,防插件自说自话)
//
// 探针语义(纯函数 plan(),单测 test-quota-probe.cjs):
//   - 冷却时长与插件实测对齐:QUOTA=4h,RATE_LIMIT=90s,TRANSPORT=60s,其余=10min
//   - 连续 3 次 QUOTA → dead:硬禁到当日本地日结束(禁死档重试;跨本地日自动解禁)
//   - 动态排序:健康档(idle/ready)保质量原序在前,cooling/dead 依次压尾
//     → 新会话从第一个健康档起步,不再烧死档(省调用=花费纪律)
//   - req_seed(真实拿到流量)清零连败;rotate.from 是唯一失败判据;付费档物理隔离
//
// 用法:
//   node quota-probe.cjs            人读表 + 落盘 monitor-records/quota-plan.json(逐笔审计追加 .jsonl)
//   node quota-probe.cjs --json     机器输出(供大屏/瞭望哨)
//   node quota-probe.cjs --health   附带 free-ladder-health.json 交叉对账
//   node quota-probe.cjs --log <path> --now <iso>   覆盖真源/判定时刻(测试用)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOG = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log';
const DEFAULT_HEALTH = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder-health.json';
const OUT_DIR = path.join(__dirname, 'monitor-records');

/* 冷却时长(与插件 v1.2.1 实测对齐:health 文件里 QUOTA 差=4h,RATE_LIMIT 差=90s) */
const cooldownDefaults = { QUOTA: 4 * 3600e3, RATE_LIMIT: 90e3, TRANSPORT: 60e3, DEFAULT: 10 * 60e3 };
const cooldownFor = (code, table = cooldownDefaults) => table[code] != null ? table[code] : table.DEFAULT;

/* ts(UTC ms)所在本地日的次日零点(UTC ms)。tzOffsetMin=本地相对 UTC 分钟偏移(480=UTC+8) */
function deadUntilFor(ts, tzOffsetMin = -new Date().getTimezoneOffset()) {
  const dayStr = new Date(ts + tzOffsetMin * 60000).toISOString().slice(0, 10);
  return Date.parse(dayStr + 'T00:00:00Z') + 86400e3 - tzOffsetMin * 60000;
}

/* 行数组 → 事件流。格式:24 字符 ISO 时间戳 + 空格 + JSON(与 ladder-daily 同真源) */
function parseLines(lines) {
  const events = []; let parseErrors = 0, blank = 0; let rungsFromLoaded = null;
  for (const raw of lines || []) {
    if (!raw || !raw.trim()) { blank++; continue; }
    if (raw.length < 25) { parseErrors++; continue; }
    const ts = Date.parse(raw.slice(0, 24));
    let obj; try { obj = JSON.parse(raw.slice(25)); } catch { parseErrors++; continue; }
    if (!isFinite(ts) || !obj || typeof obj !== 'object' || typeof obj.ev !== 'string') { parseErrors++; continue; }
    events.push({ ts, ...obj });
    if (obj.ev === 'loaded' && Array.isArray(obj.rungs)) rungsFromLoaded = obj.rungs; // 以最新 loaded 为准
  }
  events.sort((a, b) => a.ts - b.ts); // 时间序,保证 req_seed 清零连败的先后语义
  return { events, parseErrors, blank, rungsFromLoaded };
}

/* 纯函数:事件流 → 每档健康态 + 动态排序。now 必传(确定性);无副作用 */
function plan({ rungs, events, now, tzOffsetMin, cooldownMs, deadStreak = 3 }) {
  if (!isFinite(now)) throw new TypeError('plan: now 必须是有效毫秒时间戳');
  const tz = tzOffsetMin != null ? tzOffsetMin : -new Date().getTimezoneOffset();
  const cd = cooldownMs || cooldownDefaults;
  const listed = [...new Set(rungs || [])];
  const paidTargets = new Set();
  const SAW_FAIL_CODES = new Set(['QUOTA', 'RATE_LIMIT']); // TRANSPORT 瞬态且插件不计账,补录只认这两码(防对账噪声)

  /* 预扫:rotate(from,code) 时间轴 —— 用于判定 saw 是否是 rotate 的重复观测(10s 内跟随即重复) */
  const rotIdx = new Map();
  for (const e of events || []) {
    if (e && isFinite(e.ts) && e.ev === 'rotate' && typeof e.from === 'string') {
      const k = e.from + '|' + (e.code || '');
      if (!rotIdx.has(k)) rotIdx.set(k, []);
      rotIdx.get(k).push(e.ts);
    }
  }
  const sawRedundant = (e) => {
    const arr = rotIdx.get((e.current || '') + '|' + (e.code || ''));
    return !!(arr && arr.some((t) => t > e.ts && t <= e.ts + 10e3));
  };

  const mk = (rung) => ({ rung, status: 'idle', fails: {}, failCount: 0, successCount: 0, failRate: null, failStreak: 0, lastFailAt: null, lastFailCode: null, cooldownUntil: 0, deadUntil: 0, lastOkAt: null, evCount: 0 });
  const st = new Map(listed.map((r) => [r, mk(r)]));
  const seenElsewhere = new Set();
  const touch = (id) => { if (id && !st.has(id)) seenElsewhere.add(id); };
  const registerFail = (s, code, ts) => {
    s.fails[code] = (s.fails[code] || 0) + 1;
    s.failCount += 1; s.failStreak += 1; s.evCount++;
    s.lastFailAt = ts; s.lastFailCode = code;
    s.cooldownUntil = ts + cooldownFor(code, cd);
  };

  for (const e of events || []) {
    if (!e || !isFinite(e.ts) || e.ts > now) continue; // 未来事件不参与判定
    if (e.ev === 'paid_switch' && typeof e.to === 'string') { paidTargets.add(e.to); touch(e.from); continue; }
    if (e.ev === 'rotate' && typeof e.from === 'string') {
      touch(e.from); touch(e.to); // 未列档(如 ghost/已下线)也要登记进 unlisted
      const s = st.get(e.from); if (!s) continue;
      registerFail(s, typeof e.code === 'string' ? e.code : 'DEFAULT', e.ts);
      continue;
    }
    if (e.ev === 'req_seed' && e.provider && e.model) {
      const id = e.provider + '/' + e.model;
      const s = st.get(id);
      if (s) { s.failStreak = 0; s.lastOkAt = e.ts; s.successCount += 1; s.evCount++; } else touch(id); // 真实拿到流量 → 连败清零
      continue;
    }
    if (e.ev === 'saw' && e.current && SAW_FAIL_CODES.has(e.code)) {
      const s = st.get(e.current);
      if (s && !sawRedundant(e)) registerFail(s, e.code, e.ts); // 插件记了账但没 rotate 的失败,补录;10s 内有 rotate 的属同一失败,不双计
      else if (!s) touch(e.current);
      continue;
    }
    if (e.ev === 'saw' && e.current) touch(e.current); // 其余观测事件:只登记
  }

  const out = [...st.values()].map((s) => {
    const denom = s.failCount + s.successCount;
    if (denom > 0) s.failRate = Math.round((s.failCount / denom) * 1000) / 1000;
    s.chronic = denom >= 5 && s.failRate >= 0.9; // 慢性死档:≥5 次真实尝试、≥90% 失败 —— 即使冷却过期也降位
    if (s.lastFailCode === 'QUOTA' && s.failStreak >= deadStreak) {
      const du = deadUntilFor(s.lastFailAt, tz);
      if (now < du) return { ...s, status: 'dead', deadUntil: du };
    }
    if (now < s.cooldownUntil) return { ...s, status: 'cooling' };
    return { ...s, status: s.evCount > 0 ? 'ready' : 'idle' };
  });

  const eligible = out.filter((s) => s.status === 'ready' || s.status === 'idle');
  const frontClean = eligible.filter((s) => !s.chronic); // 动态排序:干净档保质量原序在前,慢性死档紧随其后压尾
  const frontChronic = eligible.filter((s) => s.chronic);
  const cooling = out.filter((s) => s.status === 'cooling');
  const dead = out.filter((s) => s.status === 'dead');
  const counts = { ready: eligible.filter((s) => s.status === 'ready').length, idle: eligible.filter((s) => s.status === 'idle').length, chronic: frontChronic.length, cooling: cooling.length, dead: dead.length };

  return {
    generatedAt: new Date(now).toISOString(), now,
    rungs: out,
    order: [...frontClean, ...frontChronic, ...cooling, ...dead].map((s) => ({ rung: s.rung, status: s.status, chronic: !!s.chronic })),
    unlisted: [...seenElsewhere].filter((id) => !paidTargets.has(id) && !listed.includes(id)),
    paidExcluded: [...paidTargets],
    counts, totalEvents: (events || []).length,
  };
}

/* CLI 便捷:原始行 → { events, rungsFromLoaded } */
function ingest(rawLines) { const p = parseLines(rawLines); return { events: p.events, rungsFromLoaded: p.rungsFromLoaded || [], ...p }; }

/* 插件 health 文件交叉对账:同一档,插件自记 vs 事件重算。
   Δ 方向即审计结论:Δ>0 探针多记(日志有插件没记的失败);Δ<0 插件多记(账上有、日志缺口——真发现);
   |Δ|≤60s 视为一致。 */
function crossCheckHealth(planRungs, healthJson) {
  const rows = [];
  for (const [rung, h] of Object.entries(healthJson || {})) {
    const mine = planRungs.find((s) => s.rung === rung);
    const delta = mine && mine.lastFailAt != null && h.lastFailAt != null ? mine.lastFailAt - h.lastFailAt : null;
    const pluginFails = Object.values(h.fails || {}).reduce((a, b) => a + b, 0);
    rows.push({
      rung,
      pluginLastFailAt: h.lastFailAt || null,
      pluginCooldownUntil: h.cooldownUntil || null,
      pluginFailCount: pluginFails,
      probeFailCount: mine ? mine.failCount : null,
      probeCooldownUntil: mine ? mine.cooldownUntil : null,
      lastFailAtDeltaMs: delta,
      honest: delta == null ? 'no-evidence' : Math.abs(delta) <= 60e3 ? 'match' : delta > 0 ? 'probe-extra' : 'plugin-extra',
    });
  }
  return rows;
}

function fmtTable(r) {
  const pad = (s, n) => String(s).padEnd(n);
  const when = (t) => t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : '-';
  const head = pad('状态', 9) + pad('档位', 62) + pad('连败', 6) + pad('失败/成功率', 13) + pad('末次失败', 21) + pad('冷却至', 21) + '禁至';
  const zh = { ready: 'ready ', idle: 'idle  ', cooling: 'cooling', dead: 'DEAD  ' };
  const rows = r.order.map((o) => {
    const s = r.rungs.find((x) => x.rung === o.rung);
    const rate = s.failRate == null ? '-' : (Math.round(s.failRate * 100) + '% of ' + (s.failCount + s.successCount)) + (s.chronic ? ' ⚠慢性' : '');
    return pad(zh[s.status] + (s.chronic ? '~' : ' '), 9) + pad(s.rung, 62) + pad(s.failStreak, 6) + pad(rate, 13) + pad(when(s.lastFailAt), 21) + pad(s.status === 'cooling' ? when(s.cooldownUntil) : '-', 21) + (s.status === 'dead' ? when(s.deadUntil) : '-');
  });
  return [head, '-'.repeat(head.length), ...rows].join('\n')
    + `\n\n前排=${r.counts.ready}+${r.counts.idle}  cooling=${r.counts.cooling}  dead=${r.counts.dead}  unlisted=${r.unlisted.length}  paid隔离=${r.paidExcluded.length}  事件=${r.totalEvents}`;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k) => args.includes(k) ? args[args.indexOf(k) + 1] : null;
  const logPath = get('--log') || DEFAULT_LOG;
  const now = get('--now') ? Date.parse(get('--now')) : Date.now();
  const p = parseLines(fs.readFileSync(logPath, 'utf8').split('\n'));
  const r = plan({ rungs: p.rungsFromLoaded, events: p.events, now });

  let healthRows = null;
  if (args.includes('--health')) {
    try { healthRows = crossCheckHealth(r.rungs, JSON.parse(fs.readFileSync(DEFAULT_HEALTH, 'utf8'))); }
    catch (e) { healthRows = [{ rung: '(health 文件不可达)', honest: String(e.message || e).slice(0, 60) }]; }
  }

  const payload = { log: logPath, parseErrors: p.parseErrors, blank: p.blank, ...r, health: healthRows };
  if (args.includes('--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('quota-probe — ' + logPath + '  @ ' + r.generatedAt + '  parseErrors=' + p.parseErrors);
    console.log(fmtTable(r));
    if (healthRows) {
      console.log('\n=== health 交叉对账(插件自记 vs 事件重算)===');
      for (const h of healthRows) {
        const mark = { match: '✅', 'probe-extra': '🔸', 'plugin-extra': '❌', 'no-evidence': '⚠️ ' }[h.honest] || '❓';
        const note = { match: '一致', 'probe-extra': '探针多记(日志有、插件账没记)', 'plugin-extra': '插件多记(账上有、日志缺口)' }[h.honest] || h.honest;
        console.log(`  ${mark} ${h.rung}  Δ=${h.lastFailAtDeltaMs == null ? '-' : h.lastFailAtDeltaMs + 'ms'}  插件账=${h.pluginFailCount}笔/探针=${h.pluginFailCount == null ? '-' : h.probeFailCount}笔  ${note}`);
      }
    }
  }

  // 常驻资产落盘 + 逐笔审计(只在本机真实时刻写,--now 测试跑不写)
  if (!get('--now')) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'quota-plan.json'), JSON.stringify(payload, null, 2));
    fs.appendFileSync(path.join(OUT_DIR, 'quota-probe.jsonl'), JSON.stringify({ at: new Date(now).toISOString(), order: r.order.map((o) => o.rung + ':' + o.status), counts: r.counts, parseErrors: p.parseErrors }) + '\n');
    console.log('\nsaved: monitor-records/quota-plan.json (+ 逐笔 quota-probe.jsonl)');
  }
}

module.exports = { plan, parseLines, deadUntilFor, ingest, crossCheckHealth, cooldownDefaults };
if (require.main === module) main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
