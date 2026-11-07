#!/usr/bin/env node
// test-ladder-daily.cjs — ladder-daily.cjs 验收测试
// 锚点:① 哨兵(model-sentinel.cjs,独立作者/独立解析器)全量口径交叉对账——对不上=真 bug;
//      ② 时区日界陷阱(UTC+8 下 15:59Z 与 16:01Z 必须分属两天)——专治 slice 类时间戳 bug(e2e-collect.cjs 已知病例)
'use strict';
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { analyze, dayOf } = require('./ladder-daily.cjs');

const t = [];
const test = (name, fn) => t.push([name, fn]);

const line = (ts, obj) => ts + ' ' + JSON.stringify(obj);

test('dayOf:UTC+8 日界——15:59Z 属 11-06,16:01Z 属 11-07', () => {
  assert.equal(dayOf('2026-11-06T15:59:00.000Z', 480), '2026-11-06');
  assert.equal(dayOf('2026-11-06T16:01:00.000Z', 480), '2026-11-07');
});

test('基本统计:rotate 计数+按因、override、seed 模型聚合', () => {
  const lines = [
    line('2026-11-01T01:00:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
    line('2026-11-01T02:00:00.000Z', { ev: 'rotate', code: 'RATE_LIMIT', from: 'b', to: 'c', rung: 2, sessionId: 's1' }),
    line('2026-11-01T03:00:00.000Z', { ev: 'req_route_override', turn: 1, step: 1, from: 'a', to: 'b' }),
    line('2026-11-01T04:00:00.000Z', { ev: 'req_seed', provider: 'ovh-free', model: 'Qwen3.5-9B', turn: 1, step: 1 }),
    line('2026-11-01T05:00:00.000Z', { ev: 'req_seed', provider: 'ovh-free', model: 'Qwen3.5-9B', turn: 1, step: 2 }),
  ];
  const r = analyze(lines, { tzOffsetMin: 480 });
  assert.equal(r.totals.rotate, 2);
  assert.equal(r.totals.quota, 1);
  assert.equal(r.totals.rateLimit, 1);
  assert.equal(r.totals.override, 1);
  assert.equal(r.totals.events, 5);
  assert.equal(r.models[0].model, 'ovh-free/Qwen3.5-9B');
  assert.equal(r.models[0].count, 2);
});

test('时区日界实弹:同一 UTC 日内跨 16:00Z 的两条 rotate 分属两个本地日', () => {
  const lines = [
    line('2026-11-06T15:59:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
    line('2026-11-06T16:01:00.000Z', { ev: 'rotate', code: 'RATE_LIMIT', from: 'b', to: 'c', rung: 2, sessionId: 's1' }),
  ];
  const r = analyze(lines, { tzOffsetMin: 480 });
  assert.equal(r.days.length, 2);
  assert.equal(r.days[0].date, '2026-11-06');
  assert.equal(r.days[0].rotate, 1);
  assert.equal(r.days[1].date, '2026-11-07');
  assert.equal(r.days[1].rotate, 1);
});

test('畸形行计入 parseErrors 不崩;空行忽略且不算错', () => {
  const lines = [
    line('2026-11-01T01:00:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
    '这不是一行日志',
    '2026-11-01T99:99:99.000Z {"ev":"rotate"}',
    '',
    '   ',
  ];
  const r = analyze(lines, { tzOffsetMin: 480 });
  assert.equal(r.parseErrors, 2);
  assert.equal(r.blank, 2);
  assert.equal(r.totals.rotate, 1);
});

test('--from/--to 按本地日含边界过滤', () => {
  const lines = [
    line('2026-11-01T01:00:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
    line('2026-11-02T01:00:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
    line('2026-11-03T01:00:00.000Z', { ev: 'rotate', code: 'QUOTA', from: 'a', to: 'b', rung: 1, sessionId: 's1' }),
  ];
  const r = analyze(lines, { tzOffsetMin: 480, from: '2026-11-02', to: '2026-11-02' });
  assert.equal(r.days.length, 1);
  assert.equal(r.totals.rotate, 1);
});

test('sessions 去重与 exhaust/paid_switch 计数', () => {
  const lines = [
    line('2026-11-01T01:00:00.000Z', { ev: 'exhaust', turn: 1, step: 4, code: 'RATE_LIMIT', sessionId: 's1' }),
    line('2026-11-01T02:00:00.000Z', { ev: 'exhaust', turn: 2, step: 4, code: 'QUOTA', sessionId: 's2' }),
    line('2026-11-01T03:00:00.000Z', { ev: 'paid_switch', turn: 2, step: 5, code: 'QUOTA', from: 'a', to: 'b', sessionId: 's2' }),
    line('2026-11-01T04:00:00.000Z', { ev: 'saw', turn: 1, step: 1, code: 'RATE_LIMIT', idx: 0, upstream: 'u', current: 'c', sessionId: 's3' }),
  ];
  const r = analyze(lines, { tzOffsetMin: 480 });
  assert.equal(r.totals.exhaust, 2);
  assert.equal(r.totals.paidSwitch, 1);
  assert.equal(r.totals.saw, 1);
  assert.equal(r.totals.sessions, 3);
});

test('空输入 → 零值结构,不抛异常', () => {
  const r = analyze([], { tzOffsetMin: 480 });
  assert.equal(r.totals.events, 0);
  assert.equal(r.days.length, 0);
  assert.equal(r.parseErrors, 0);
});

/* LIVE:真日志 × 哨兵交叉对账(独立解析器,同一时刻读同一文件) */
test('LIVE:与 model-sentinel 全量口径对账(rotate/byCode/override/paid_switch/total 全等)', () => {
  const fs = require('node:fs');
  const LOG = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log';
  const SENTINEL = 'C:/Users/64562/Scripts/model-sentinel/model-sentinel.cjs';
  if (!fs.existsSync(LOG) || !fs.existsSync(SENTINEL)) { console.log('         (跳过:日志或哨兵不在位)'); return; }
  const s = JSON.parse(spawnSync(process.execPath, [SENTINEL, '--json'], { encoding: 'utf8', timeout: 30000 }).stdout);
  const r = analyze(fs.readFileSync(LOG, 'utf8').split('\n'), { tzOffsetMin: -new Date().getTimezoneOffset() });
  assert.equal(r.totals.events, s.logs.free_ladder.total_events, 'total_events 不等');
  assert.equal(r.totals.rotate, s.stats.rotate_total, 'rotate 不等');
  assert.equal(r.totals.quota, s.stats.rotate_by_code.QUOTA, 'QUOTA 不等');
  assert.equal(r.totals.rateLimit, s.stats.rotate_by_code.RATE_LIMIT, 'RATE_LIMIT 不等');
  assert.equal(r.totals.override, s.stats.req_route_override_count, 'override 不等');
  assert.equal(r.totals.paidSwitch, s.stats.paid_switch_count, 'paid_switch 不等');
  assert.equal(r.parseErrors, s.logs.free_ladder.parse_errors, 'parse_errors 不等');
});

(async () => {
  let pass = 0, fail = 0;
  for (const [name, fn] of t) {
    try { await fn(); pass++; console.log('  ok   - ' + name); }
    catch (e) { fail++; console.log('  FAIL - ' + name + '\n         ' + String(e.message).split('\n')[0]); }
  }
  console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
