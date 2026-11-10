'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runCodingLoop, runCommand, relativeFile } = require('../coding-loop');
const { parseArgs } = require('../code-task');
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cua-code-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('real subprocess verification reads actual exit codes', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'check.cjs'), 'process.exit(1)\n');
  assert.equal((await runCommand(dir, [process.execPath, 'check.cjs'])).ok, false);
  await fs.writeFile(path.join(dir, 'check.cjs'), 'process.exit(0)\n');
  assert.equal((await runCommand(dir, [process.execPath, 'check.cjs'])).ok, true);
}));

test('end-to-end one-patch repair runs real failing and passing verification', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'module.exports = () => 1;\n');
  await fs.writeFile(path.join(dir, 'check.cjs'), "if (require('./app')() !== 2) process.exit(1);\n");
  const out = await runCodingLoop({
    project: dir, goal: 'Return two', verifyCommand: [process.execPath, 'check.cjs'],
    model: async () => ({ path: 'app.js', oldText: '=> 1', newText: '=> 2', reason: 'actual repair' })
  });
  assert.equal(out.baseline.ok, false);
  assert.equal(out.status, 'verified');
  assert.equal(out.rounds[0].verification.code, 0);
  const saved = JSON.parse(await fs.readFile(path.join(dir, '.cua-coding-runs/latest/RESULT.json')));
  assert.equal(saved.status, 'verified');
}));

test('model claim cannot override failing verification', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const n = 1;\n');
  const out = await runCodingLoop({
    project: dir, goal: 'fix', verifyCommand: ['fake', 'test'], maxRounds: 1,
    model: async () => ({ path: 'app.js', oldText: '= 1', newText: '= 2', reason: 'all tests passed!' }),
    runner: async () => ({ ok: false, code: 1, stderr: 'RED' })
  });
  assert.equal(out.status, 'not-verified');
}));

test('ambiguous replacement never modifies file', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const a = 1, b = 1;\n');
  const out = await runCodingLoop({
    project: dir, goal: 'fix', verifyCommand: ['fake'], maxRounds: 1,
    model: async () => ({ path: 'app.js', oldText: '= 1', newText: '= 2' }),
    runner: async () => ({ ok: false, code: 1 })
  });
  assert.equal(out.rounds[0].error, 'PATCH_MATCH_COUNT_2');
  assert.equal(await fs.readFile(path.join(dir, 'app.js'), 'utf8'), 'const a = 1, b = 1;\n');
}));

test('path traversal and test manipulation are rejected', async () => {
  assert.throws(() => relativeFile('../outside.js'), /INVALID_PATH/);
  assert.throws(() => relativeFile('a/../outside.js'), /INVALID_PATH/);
  assert.deepEqual(parseArgs(['--project', '.', '--goal', 'fix', '--verify', 'node', '--test']).verifyCommand, ['node', '--test']);
});
