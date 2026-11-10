'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../freecad-tool');
const { execute } = require('../action');

test('dispatches FreeCAD actions with object-shaped arguments', async () => {
  const original = {
    createVerifiedBox: tool.createVerifiedBox,
    exportStep: tool.exportStep,
    runScript: tool.runScript,
  };
  const calls = [];
  try {
    tool.createVerifiedBox = async args => { calls.push({ name: 'box', args }); return { ok: true }; };
    tool.exportStep = async args => { calls.push({ name: 'step', args }); return { ok: true }; };
    tool.runScript = async args => { calls.push({ name: 'script', args }); return { ok: true }; };
    assert.equal((await execute({ step: { action: 'fc-box', length: 12, width: 6, height: 4, outPath: 'box.FCStd' } })).ok, true);
    assert.equal((await execute({ step: { action: 'fc-step', fcstd: 'a.FCStd', outPath: 'a.step' } })).ok, true);
    assert.equal((await execute({ step: { action: 'fc-run', scriptPath: 'a.py' } })).ok, true);
    assert.deepEqual(calls, [
      { name: 'box', args: { length: 12, width: 6, height: 4, outPath: 'box.FCStd' } },
      { name: 'step', args: { fcstdPath: 'a.FCStd', outPath: 'a.step' } },
      { name: 'script', args: 'a.py' },
    ]);
  } finally { Object.assign(tool, original); }
});

test('invalid CAD dimensions and script paths fail without executing FreeCAD', async () => {
  assert.equal((await tool.createVerifiedBox({ length: 'injection', width: 5, height: 5 })).error, 'invalid_dimensions');
  assert.equal((await tool.createVerifiedBox({ length: Infinity, width: 5, height: 5 })).error, 'invalid_dimensions');
  assert.equal((await tool.runScript('../relative.py')).error, 'invalid_script_path');
  assert.equal((await tool.exportStep({ fcstdPath: 'relative.FCStd', outPath: 'x.step' })).error, 'invalid_path');
});
