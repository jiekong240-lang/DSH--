'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { createTaskStore } = require('../task');
const { runOnce } = require('../index');

async function fixture(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cua-task-state-'));
  try { return await fn(path.join(dir, 'task.json')); }
  finally { await fsp.rm(dir, { recursive: true, force: true }); }
}
const task = () => ({ id: 't1', steps: [{ action: 'type', text: 'A',
  expect: { focusNameIncludes: 'Editor' } }] });
const obs = { ts: 1, note: 'test', windows: [], screenshot: null, focus: { Name: 'Editor' },
  channels: { semantic: true } };

test('corrupt existing task fails visibly rather than making a new demo task', async () => fixture(async file => {
  await fsp.writeFile(file, '{"steps":');
  const store = createTaskStore(file);
  assert.throws(() => store.loadTask(), /TASK_STATE_CORRUPT/);
  assert.equal(await fsp.readFile(file, 'utf8'), '{"steps":');
}));

test('checkpoint is durably written before any action and cleared on verified advance', async () => fixture(async file => {
  const store = createTaskStore(file);
  store.saveTask(task());
  const pending = store.beginAction(store.loadTask(), task().steps[0]);
  assert.equal(store.loadTask().pendingAction.id, pending.pendingAction.id);
  assert.throws(() => store.beginAction(pending, task().steps[0]), /PENDING_ACTION_RECONCILIATION/);
  const done = store.advanceTask(pending);
  assert.equal(done.steps.length, 0);
  assert.equal(store.loadTask().pendingAction, undefined);
}));

test('CUA refuses to replay an in-flight action after restart', async () => fixture(async file => {
  const store = createTaskStore(file);
  store.saveTask(task());
  store.beginAction(store.loadTask(), task().steps[0]);
  let writes = 0;
  const result = await runOnce(store.loadTask(), { execute: async () => { writes++; return { ok: true }; } });
  assert.equal(result.reason, 'PENDING_ACTION_RECONCILIATION');
  assert.equal(writes, 0);
}));

test('failed pre-dispatch checkpoint guarantees zero attempted writes', async () => {
  let writes = 0;
  const ports = {
    observe: async () => obs,
    suggestFromVision: async () => null,
    checkGate: () => ({ allow: true }),
    beginAction: () => { throw new Error('disk full'); },
    execute: async () => { writes++; return { ok: true }; },
    supervise: async () => ({}),
  };
  const result = await runOnce(task(), ports);
  assert.equal(result.reason, 'PRE_ACTION_CHECKPOINT_FAILED');
  assert.equal(writes, 0);
});

test('a write can advance only after verification AND durable progress', async () => fixture(async file => {
  const store = createTaskStore(file);
  store.saveTask(task());
  let sends = 0;
  const ports = {
    observe: async () => obs,
    suggestFromVision: async () => null,
    checkGate: () => ({ allow: true }),
    beginAction: store.beginAction,
    advanceTask: store.advanceTask,
    recordFailure: store.recordFailure,
    execute: async () => { sends++; return { ok: true }; },
    supervise: async () => ({ audited: true }),
  };
  const result = await runOnce(store.loadTask(), ports);
  assert.equal(result.verification.status, 'verified');
  assert.equal(result.done, false);
  assert.equal(sends, 1);
  assert.equal(store.loadTask().steps.length, 0);
  assert.equal(store.loadTask().pendingAction, undefined);
}));

test('driver ok with mismatched postcondition stays pending and blocks replay', async () => fixture(async file => {
  const store = createTaskStore(file);
  store.saveTask(task());
  let sends = 0;
  const ports = {
    observe: async () => ({ ...obs, focus: { Name: 'Other' } }),
    suggestFromVision: async () => null,
    checkGate: () => ({ allow: true }),
    beginAction: store.beginAction,
    advanceTask: store.advanceTask,
    recordFailure: store.recordFailure,
    execute: async () => { sends++; return { ok: true }; },
    supervise: async () => ({}),
  };
  const first = await runOnce(store.loadTask(), ports);
  assert.equal(first.verification.status, 'not-verified');
  assert.equal(store.loadTask().pendingAction.action, 'type');
  const second = await runOnce(store.loadTask(), ports);
  assert.equal(second.reason, 'PENDING_ACTION_RECONCILIATION');
  assert.equal(sends, 1);
}));
