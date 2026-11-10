'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findElementsByName, parseBoundingRectangle } = require('../accessibility');

test('parses named and comma-delimited UIA rectangles', () => {
  const named = parseBoundingRectangle('X=100,Y=200,Width=50,Height=30');
  const numeric = parseBoundingRectangle('100,200,50,30');
  assert.deepEqual(named, numeric);
  assert.equal(named.centerX, 125);
  assert.equal(named.centerY, 215);
  assert.equal(parseBoundingRectangle('bad rectangle'), null);
  assert.equal(parseBoundingRectangle('0,0,0,50'), null);
});

test('UIA search uses window ancestor and a shared mutable results list', async () => {
  const result = await findElementsByName("Save's file", 3, async command => {
    assert.ok(command.includes("$found.Add("));
    assert.ok(command.includes("$found.ToArray()"));
    assert.ok(command.includes("$root = $parent"));
    assert.ok(command.includes("IndexOf('Save''s file'"));
    assert.ok(!command.includes('$matches +='));
    return { ok: true, stdout: '{"Name":"Save\\u0027s file","BoundingRectangle":"100,200,50,30"}' };
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].Name, "Save's file");
});

test('UIA name search treats brackets literally and caps result limit', async () => {
  let script;
  await findElementsByName('File [1]', 100000, async cmd => {
    script = cmd;
    return { ok: true, stdout: '[]' };
  });
  assert.ok(script.includes("IndexOf('File [1]'"));
  assert.ok(script.includes('$found.Count -ge 30'));
  assert.equal(script.includes('-like'), false);
});
