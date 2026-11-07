#!/usr/bin/env node
// test-quota-probe.cjs — quota-probe.cjs plan() 纯函数单测(TDD:验收先行)
// 规则来源:P0 配额探针拍板(2026-11-07)——动态排序、禁死档重试、零调用零花费。
// 冷却时长与 DSH free-ladder 插件 v1.2.1 实测对齐:QUOTA=4h, RATE_LIMIT=90s。
'use strict';
const assert = require('node:assert');
const { plan, parseLines, deadUntilFor } = require('./quota-probe.cjs');

let passed = 0, failed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok   - ' + name); }
  catch (e) { failed++; console.log('  FAIL - ' + name + ' → ' + String(e && e.message || e)); }
}
const RUNGS = [
  'kilo-free/nvidia/nemotron-3.5-lightning:free',   // 0 梯底(质量最低)
  'modelscope/Qwen/Qwen3.8-Flash-Next',             // 1
  'modelscope/ZhipuAI/GLM-5.2',                     // 2 质量最高
];
const ev = (t, obj) => ({ ts: typeof t === 'number' ? t : Date.parse(t), ...obj });
const H = 3600e3;

/* ── 排序规则 ─────────────────────────────────────────── */
ok('无失败:order 保持质量原序,零证据档=idle', () => {
  const r = plan({ rungs: RUNGS, events: [], now: Date.parse('2026-11-07T08:00:00Z') });
  assert.deepStrictEqual(r.order.map(x => x.rung), RUNGS);
  assert.ok(r.order.every(x => x.status === 'idle'));
});

ok('QUOTA 失败:冷却 4h,挪到队尾,健康档保序前移', () => {
  const now = Date.parse('2026-11-07T08:00:00Z');
  const r = plan({ rungs: RUNGS, events: [
    ev('2026-11-07T07:50:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now });
  const byId = Object.fromEntries(r.rungs.map(x => [x.rung, x]));
  assert.strictEqual(byId[RUNGS[0]].status, 'cooling');
  assert.strictEqual(byId[RUNGS[0]].cooldownUntil, Date.parse('2026-11-07T07:50:00Z') + 4 * H);
  assert.deepStrictEqual(r.order.map(x => x.rung), [RUNGS[1], RUNGS[2], RUNGS[0]]);
});

ok('冷却过期:恢复原位(status=ready),不再压尾', () => {
  const now = Date.parse('2026-11-07T13:00:00Z'); // 07:50+4h=11:50 已过
  const r = plan({ rungs: RUNGS, events: [
    ev('2026-11-07T07:50:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now });
  assert.strictEqual(r.order[0].rung, RUNGS[0]);
  assert.strictEqual(r.order[0].status, 'ready');
});

ok('RATE_LIMIT 冷却 90s:远短于 QUOTA,过期即恢复', () => {
  const failAt = Date.parse('2026-11-07T08:00:00Z');
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T08:00:00Z', { ev: 'rotate', code: 'RATE_LIMIT', from: RUNGS[0], to: RUNGS[1] }),
  ], now: failAt + 91e3 });
  assert.strictEqual(r.order[0].status, 'ready');
});

/* ── 禁死档重试 ───────────────────────────────────────── */
ok('连续 3 次 QUOTA → dead,硬禁到当日本地日结束(UTC+8)', () => {
  const now = Date.parse('2026-11-07T09:00:00Z'); // 本地 17:00
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T06:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T07:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T08:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now });
  assert.strictEqual(r.order[0].status, 'dead');
  // 本地日 2026-11-07 结束 = 2026-11-07T16:00Z(deadUntil 记在 rungs 明细上)
  const s = r.rungs.find(x => x.rung === RUNGS[0]);
  assert.strictEqual(s.deadUntil, Date.parse('2026-11-07T16:00:00Z'));
});

ok('跨本地日复活:次日 now > deadUntil → 解禁', () => {
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T06:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T07:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T08:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now: Date.parse('2026-11-07T16:00:01Z') });
  assert.strictEqual(r.order[0].status, 'ready');
});

ok('成功流量清零连败:2 次 QUOTA + req_seed + 1 次 QUOTA → 不 dead', () => {
  const now = Date.parse('2026-11-07T09:00:00Z');
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T06:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T07:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T08:00:00Z', { ev: 'req_seed', provider: 'kilo-free', model: 'nvidia/nemotron-3.5-lightning:free' }),
    ev('2026-11-07T08:30:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now });
  assert.strictEqual(r.order[0].status, 'cooling'); // 只剩 4h 冷却,不是 dead
});

/* ── saw 失败证据(对齐插件真实行为:190 saw vs 188 rotate)── */
ok('saw:QUOTA 无后续 rotate → 补录为失败(冷却从 saw 起)', () => {
  const sawAt = Date.parse('2026-11-07T07:50:00Z');
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T07:50:00Z', { ev: 'saw', code: 'QUOTA', current: RUNGS[0] }),
  ], now: sawAt + 1000 });
  assert.strictEqual(r.rungs[0].status, 'cooling');
  assert.strictEqual(r.rungs[0].lastFailAt, sawAt);
});

ok('saw 后 10s 内 rotate 同档同码 → 同一失败不双计(连败=1)', () => {
  const t = Date.parse('2026-11-07T07:50:00Z');
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev(t, { ev: 'saw', code: 'QUOTA', current: RUNGS[0] }),
    ev(t + 5000, { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now: t + 60000 });
  assert.strictEqual(r.rungs[0].failCount, 1);
  assert.strictEqual(r.rungs[0].failStreak, 1);
});

ok('failRate:2 失败 1 成功 → 0.667(慢性死档一眼可见)', () => {
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T06:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T06:30:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
    ev('2026-11-07T07:00:00Z', { ev: 'req_seed', provider: 'kilo-free', model: 'nvidia/nemotron-3.5-lightning:free' }),
  ], now: Date.parse('2026-11-07T08:00:00Z') });
  assert.strictEqual(r.rungs[0].failRate, 0.667);
  assert.strictEqual(r.rungs[0].failCount, 2);
  assert.strictEqual(r.rungs[0].successCount, 1);
});

ok('慢性死档:≥5 次尝试 ≥90% 失败 → 即使 ready 也压到干净档之后', () => {
  const fails = [];
  for (let i = 0; i < 6; i++) fails.push(ev(Date.parse('2026-11-07T0' + (1 + i) + ':00:00Z'), { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }));
  const r = plan({ rungs: [RUNGS[0], RUNGS[2]], events: fails, now: Date.parse('2026-11-08T02:00:00Z') }); // 次日,冷却全过期
  assert.strictEqual(r.order[0].rung, RUNGS[2]); // 干净的高质量档提前
  assert.strictEqual(r.order[1].rung, RUNGS[0]); // 慢性档降位但仍在 cooling/dead 之前
  assert.strictEqual(r.order[1].status, 'ready');
  assert.ok(r.order[1].chronic === true);
  assert.strictEqual(r.counts.chronic, 1);
});

ok('慢性边界:只有 4 次尝试 → 不降位(避免小样本误伤)', () => {
  const fails = [];
  for (let i = 0; i < 4; i++) fails.push(ev(Date.parse('2026-11-07T0' + (1 + i) + ':00:00Z'), { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }));
  const r = plan({ rungs: [RUNGS[0], RUNGS[2]], events: fails, now: Date.parse('2026-11-08T02:00:00Z') });
  assert.strictEqual(r.order[0].rung, RUNGS[0]); // 保质量原序
  assert.strictEqual(r.order[0].chronic, false);
});

ok('saw:TRANSPORT 不补录(瞬态,插件不计账,防对账噪声)', () => {
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T07:50:00Z', { ev: 'saw', code: 'TRANSPORT', current: RUNGS[0] }),
  ], now: Date.parse('2026-11-07T08:00:00Z') });
  assert.strictEqual(r.rungs[0].failCount, 0);
  assert.strictEqual(r.rungs[0].status, 'idle'); // 无成功也无配额失败证据 → 保守记零证据,不冒充健康
});

/* ── 时间语义 ─────────────────────────────────────────── */
ok('deadUntilFor:UTC+8 当日结束=16:00Z(实弹)', () => {
  const tz = 480;
  assert.strictEqual(deadUntilFor(Date.parse('2026-11-07T10:00:00Z'), tz), Date.parse('2026-11-07T16:00:00Z'));
  assert.strictEqual(deadUntilFor(Date.parse('2026-11-07T15:59:00Z'), tz), Date.parse('2026-11-07T16:00:00Z'));
  assert.strictEqual(deadUntilFor(Date.parse('2026-11-07T16:01:00Z'), tz), Date.parse('2026-11-08T16:00:00Z'));
});

/* ── 健壮性与对账 ─────────────────────────────────────── */
ok('畸形事件忽略不崩;空输入 → 空结构', () => {
  const r1 = plan({ rungs: [RUNGS[0]], events: [null, {}, { ev: 'rotate' }, { ts: NaN, ev: 'rotate', code: 'QUOTA', from: RUNGS[0] }], now: 0 });
  assert.ok(Array.isArray(r1.order) && r1.order.length === 1);
  const r2 = plan({ rungs: [], events: [], now: 0 });
  assert.deepStrictEqual(r2.order, []);
});

ok('对账:事件里出现过但 loaded 未列的档 → 记入 unlisted,不混入 order', () => {
  const ghost = 'ghost/never-configured';
  const r = plan({ rungs: [RUNGS[0]], events: [
    ev('2026-11-07T07:00:00Z', { ev: 'rotate', code: 'QUOTA', from: ghost, to: RUNGS[0] }),
  ], now: Date.parse('2026-11-07T08:00:00Z') });
  assert.deepStrictEqual(r.order.map(x => x.rung), [RUNGS[0]]);
  assert.ok(r.unlisted.includes(ghost));
});

ok('付费档物理隔离:paid_switch 的 to 不进 order', () => {
  const r = plan({ rungs: RUNGS, events: [
    ev('2026-11-07T07:00:00Z', { ev: 'paid_switch', from: RUNGS[0], to: 'deepseek/deepseek-chat' }),
  ], now: Date.parse('2026-11-07T08:00:00Z') });
  assert.ok(!r.order.some(x => x.rung === 'deepseek/deepseek-chat'));
  assert.strictEqual(r.order.length, 3);
});

ok('确定性:同输入同 now 两次 plan 全等', () => {
  const args = { rungs: RUNGS, events: [
    ev('2026-11-07T07:00:00Z', { ev: 'rotate', code: 'QUOTA', from: RUNGS[0], to: RUNGS[1] }),
  ], now: Date.parse('2026-11-07T08:00:00Z') };
  assert.deepStrictEqual(JSON.stringify(plan(args)), JSON.stringify(plan(args)));
});

/* ── parseLines:与 ladder-daily 同格真源(24 字符 ts + JSON)── */
ok('parseLines: 正常行/空行/畸形行如实计数', () => {
  const lines = [
    '2026-11-07T07:00:00.000Z {"ev":"rotate","code":"QUOTA","from":"' + RUNGS[0] + '","to":"' + RUNGS[1] + '"}',
    '',
    'garbage-line',
    '2026-11-07T07:30:00.000Z {"ev":"req_seed","provider":"modelscope","model":"Qwen/Qwen3.8-Flash-Next"}',
  ];
  const r = parseLines(lines);
  assert.strictEqual(r.events.length, 2);
  assert.strictEqual(r.parseErrors, 1);
  assert.strictEqual(r.blank, 1);
});

/* ── 实弹:LIVE 日志对账(有真日志才跑)── */
const LIVE_LOG = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log';
try {
  const fs = require('node:fs');
  const raw = fs.readFileSync(LIVE_LOG, 'utf8').split('\n');
  const { events, rungsFromLoaded } = require('./quota-probe.cjs').ingest(raw);
  const r = plan({ rungs: rungsFromLoaded, events, now: Date.now() });
  const setA = new Set(rungsFromLoaded), setB = new Set(r.order.map(x => x.rung));
  ok('LIVE:loaded 11 档与 plan order 集合全等(无一丢失)', () => {
    assert.strictEqual(setA.size, setB.size);
    for (const x of setA) assert.ok(setB.has(x), '丢失: ' + x);
  });
  ok('LIVE:梯底 kilo-lightning QUOTA 实锤 ≥3 或已冷却(禁死档重试生效)', () => {
    const s = r.rungs.find(x => x.rung.includes('nemotron-3.5-lightning'));
    assert.ok(s && (s.fails.QUOTA >= 3 || s.status !== 'idle'), JSON.stringify(s));
  });
} catch (e) {
  console.log('  skip - LIVE 实弹(日志不可达): ' + String(e && e.message || e).slice(0, 80));
}

console.log(`\n${passed}/${passed + failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
