#!/usr/bin/env node
// test-cua-lookout.cjs — cua-lookout judge() 单元测试(纯函数、零依赖、离线可跑)
// 红线对齐 engine.mjs snapshot:unverified 一律不计入问题;RED 只由真实 failed 证据触发
'use strict';
const assert = require('node:assert');
const { judge } = require('./cua-lookout.cjs');

const now = 1794037000000;
const healthyDash = {
  ok: true, at: now,
  counts: { code: 1, exec: 2, scan: 1, error: 0, task: 1, other: 0 },
  events: [{ ts: now - 1000, kind: 'code', tool: 'Edit', target: 'a.js', source: 'ZCODE' }],
};
const healthyDsh = {
  ok: true, at: now, verifiedCount: 2, unverifiedCount: 1,
  files: [{ rel: 'a.js', status: 'passed' }, { rel: 'b.js', status: 'passed' }],
  unverified: [{ rel: 'c.ts', reason: '红线:类型检查超时' }],
  tests: [], externalTests: [], repairs: [],
};

const t = [];
const test = (name, fn) => t.push([name, fn]);

test('全绿链路 → GREEN,ok=true,无 issues', () => {
  const v = judge(healthyDash, healthyDsh, now);
  assert.equal(v.verdict, 'GREEN');
  assert.equal(v.ok, true);
  assert.deepEqual(v.issues, []);
  assert.equal(v.summary.dshVerified, 2);
});

test('红灯文件(status=failed) → RED,issues 指名文件', () => {
  const dsh = { ...healthyDsh, files: [{ rel: 'red-demo-2.js', status: 'failed', message: 'SyntaxError' }] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'RED');
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.includes('red-demo-2.js')), 'issues 应指名红灯文件');
  assert.deepEqual(v.redFiles, ['red-demo-2.js']);
});

test('外部测试失败(externalTests status=failed) → RED', () => {
  const dsh = { ...healthyDsh, externalTests: [{ file: 'test-x.js', status: 'failed', output: 'AssertionError', at: now - 5 }] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'RED');
  assert.deepEqual(v.failedTests.map((f) => f.file), ['test-x.js']);
});

test('DSH 内部测试运行失败(tests status=failed) → RED', () => {
  const dsh = { ...healthyDsh, tests: [{ id: 'run-1', file: 'test-y.js', status: 'failed' }] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'RED');
  assert.deepEqual(v.failedTests.map((f) => f.file), ['test-y.js']);
});

test('unverified 不计入问题(红线) → 仍 GREEN,但计入 summary', () => {
  const dsh = { ...healthyDsh, unverifiedCount: 9, unverified: [{ rel: 'x.py', reason: '红线:语言未覆盖' }] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'GREEN');
  assert.equal(v.summary.dshUnverified, 9);
});

test('大屏不可达 → DEGRADED(链路问题,不冒充代码问题)', () => {
  const v = judge({ ok: false, error: 'fetch timeout' }, healthyDsh, now);
  assert.equal(v.verdict, 'DEGRADED');
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.startsWith('dash:down')), 'issues 应含 dash:down');
});

test('DSH 不可达 → DEGRADED,指明 dsh:down', () => {
  const v = judge(healthyDash, { ok: false, error: 'ECONNREFUSED' }, now);
  assert.equal(v.verdict, 'DEGRADED');
  assert.ok(v.issues.some((i) => i.startsWith('dsh:down')), 'issues 应含 dsh:down');
});

test('字段缺失防御:undefined 输入按 DEGRADED 处理,不抛异常', () => {
  const v = judge(undefined, undefined, now);
  assert.equal(v.verdict, 'DEGRADED');
});

test('红灯 + 链路降级同时发生 → RED 优先(代码问题 > 链路问题)', () => {
  const dsh = { ok: true, files: [{ rel: 'bad.js', status: 'failed', message: 'x' }], unverified: [], tests: [], externalTests: [] };
  const v = judge({ ok: false, error: 'down' }, dsh, now);
  assert.equal(v.verdict, 'RED');
});

test('大屏 error 计数>0 不改变红绿判定(异常是过程事件,不是失败证据)', () => {
  const dash = { ...healthyDash, counts: { ...healthyDash.counts, error: 3 } };
  const v = judge(dash, healthyDsh, now);
  assert.equal(v.verdict, 'GREEN');
});

test('同文件:旧 failed + 新 passed → GREEN(当前状态以最新为准)', () => {
  const dsh = { ...healthyDsh, externalTests: [
    { file: 'test-x.js', status: 'passed', at: now - 1 },
    { file: 'test-x.js', status: 'failed', at: now - 9 },
  ] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'GREEN');
});

test('同文件:旧 passed + 新 failed → RED(最新失败为真)', () => {
  const dsh = { ...healthyDsh, externalTests: [
    { file: 'test-x.js', status: 'failed', at: now - 1 },
    { file: 'test-x.js', status: 'passed', at: now - 9 },
  ] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'RED');
});

test('tests 运行失败但 stale=true(代码已变,结果过期) → 不计红', () => {
  const dsh = { ...healthyDsh, tests: [{ id: 'run-1', file: 'test-y.js', status: 'failed', stale: true }] };
  const v = judge(healthyDash, dsh, now);
  assert.equal(v.verdict, 'GREEN');
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
