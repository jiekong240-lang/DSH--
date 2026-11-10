'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, mouseMove, mouseClick, typeText, toSendKeysLiteral } = require('../action');

test('mouse movement rejects null and nonnumeric coordinates before dispatch', async () => {
  assert.equal((await mouseMove(null, 50)).ok, false);
  assert.equal((await mouseMove(NaN, 50)).ok, false);
  assert.equal((await mouseMove('0', 50)).ok, false);
});

test('mouse click requires target coordinates or explicit current-pointer intent', async () => {
  assert.equal((await mouseClick('left')).error, 'click requires explicit coordinates');
  assert.equal((await mouseClick('left', 10)).error, 'click requires explicit coordinates');
  assert.equal((await mouseClick('side', 10, 20)).error, 'invalid mouse button');
  const result = await execute({ step: { action: 'click' } });
  assert.equal(result.ok, false);
  assert.match(result.error, /explicit coordinates/);
});

test('text typing never silently truncates payload or interprets SendKeys modifiers', async () => {
  assert.equal((await typeText('A'.repeat(501))).error, 'text too long for SendKeys channel');
  assert.equal((await typeText('line\nline')).error, 'control characters require semantic typing channel');
  assert.equal(toSendKeysLiteral('a+b^c%d~e(f){g}'), 'a{+}b{^}c{%}d{~}e{(}f{)}{{}g{}}');
});
