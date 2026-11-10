'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runCodingLoop, runCommand, relativeFile, isVerificationArtifact } = require('../coding-loop');
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

test('baseline already passing is not mislabelled repaired', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const n = 1;\n');
  let called = false;
  const out = await runCodingLoop({ project: dir, goal: 'fix a bug', verifyCommand: [process.execPath, '--version'],
    model: async () => { called = true; throw Error('unexpected model call'); } });
  assert.equal(out.status, 'baseline-passing');
  assert.equal(called, false);
}));

test('cannot pass by rewriting verification script', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'check.cjs'), 'process.exit(1)\n');
  const out = await runCodingLoop({ project: dir, goal: 'fix a bug', maxRounds: 1,
    verifyCommand: [process.execPath, 'check.cjs'],
    model: async () => ({ path: 'check.cjs', oldText: 'exit(1)', newText: 'exit(0)' }) });
  assert.equal(out.status, 'not-verified');
  assert.equal(out.rounds[0].error, 'TEST_EDIT_REFUSED');
  assert.equal(await fs.readFile(path.join(dir, 'check.cjs'), 'utf8'), 'process.exit(1)\n');
}));

test('detects more test and config artifacts', () => {
  assert.equal(isVerificationArtifact('src/tests/app.js'), true);
  assert.equal(isVerificationArtifact('src/verify.py'), true);
  assert.equal(isVerificationArtifact('package.json'), true);
  assert.equal(isVerificationArtifact('src/app.js', ['node', 'check.cjs']), false);
});

test('API failure persists an explicit not-verified result', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const n=1;\n');
  const out = await runCodingLoop({ project: dir, goal: 'fix', verifyCommand: ['fake'],
    runner: async () => ({ ok: false, code: 1 }),
    model: async () => { throw Error('HTTP 429'); } });
  assert.equal(out.status, 'not-verified');
  assert.equal(out.rounds[0].outcome, 'model-error');
  const saved = JSON.parse(await fs.readFile(path.join(dir, '.cua-coding-runs/latest/RESULT.json')));
  assert.equal(saved.status, 'not-verified');
}));

test('hung verification child is stopped and reported as timeout', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'hang.cjs'), 'setInterval(() => {}, 1000)\n');
  const out = await runCommand(dir, [process.execPath, 'hang.cjs'], { timeoutMs: 150 });
  assert.equal(out.ok, false);
  assert.equal(out.timedOut, true);
}));


test('multi-file repair validates both edits before real verification', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'left.js'), 'module.exports = () => 1;\n');
  await fs.writeFile(path.join(dir, 'right.js'), 'module.exports = () => 3;\n');
  await fs.writeFile(path.join(dir, 'check.cjs'),
    "if (require('./left')() + require('./right')() !== 8) process.exit(1);\n");
  const out = await runCodingLoop({
    project: dir, goal: 'make sum eight',
    verifyCommand: [process.execPath, 'check.cjs'], maxRounds: 2,
    model: async () => ({ reason: 'two related modules', patches: [
      { path: 'left.js', oldText: '=> 1', newText: '=> 4' },
      { path: 'right.js', oldText: '=> 3', newText: '=> 4' }
    ] })
  });
  assert.equal(out.baseline.ok, false);
  assert.equal(out.status, 'verified');
  assert.deepEqual(out.changedPaths.sort(), ['left.js', 'right.js']);
  assert.equal(out.rounds[0].changes.length, 2);
  assert.equal((await fs.readFile(path.join(dir, 'left.js'), 'utf8')).includes('=> 4'), true);
  assert.equal((await fs.readFile(path.join(dir, 'right.js'), 'utf8')).includes('=> 4'), true);
}));

test('invalid second patch never partially writes first file', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const value = 1;\n');
  await fs.writeFile(path.join(dir, 'helper.js'), 'const helper = 3;\n');
  const out = await runCodingLoop({
    project: dir, goal: 'repair', verifyCommand: ['fake'], maxRounds: 1,
    runner: async () => ({ ok: false, code: 1 }),
    model: async () => ({ patches: [
      { path: 'app.js', oldText: '= 1', newText: '= 2' },
      { path: 'helper.js', oldText: 'does not exist', newText: 'hello' }
    ] })
  });
  assert.equal(out.status, 'not-verified');
  assert.equal(out.rounds[0].error, 'PATCH_MATCH_COUNT_0');
  assert.equal(await fs.readFile(path.join(dir, 'app.js'), 'utf8'), 'const value = 1;\n');
}));

test('multi-file repair refuses test edits and duplicate paths', async () => fixture(async dir => {
  await fs.writeFile(path.join(dir, 'app.js'), 'const value = 1;\n');
  await fs.writeFile(path.join(dir, 'check.cjs'), 'process.exit(1)\n');
  for (const second of [
    { path: 'check.cjs', oldText: 'exit(1)', newText: 'exit(0)' },
    { path: 'app.js', oldText: '= 1', newText: '= 3' }
  ]) {
    const out = await runCodingLoop({
      project: dir, goal: 'repair', verifyCommand: [process.execPath, 'check.cjs'], maxRounds: 1,
      model: async () => ({ patches: [
        { path: 'app.js', oldText: '= 1', newText: '= 2' }, second
      ] })
    });
    assert.equal(out.status, 'not-verified');
    assert.match(out.rounds[0].error, /TEST_EDIT_REFUSED|DUPLICATE_PATCH_PATH/);
    assert.equal(await fs.readFile(path.join(dir, 'app.js'), 'utf8'), 'const value = 1;\n');
  }
}));
