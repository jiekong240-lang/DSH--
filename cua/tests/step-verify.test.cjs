'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyStep } = require('../step-verify');

const base = { screenshot: 'screen-1.png', windows: [], channels: { visual: true }, focus: null };

test('screenshot filename change is not a verified write', () => {
  const actual = verifyStep({ action: 'type', text: 'hello' }, base,
    { ...base, screenshot: 'screen-2.png' }, { ok: true });
  assert.equal(actual.status, 'unknown');
  assert.equal(actual.reason, 'POSTCONDITION_REQUIRED');
});

test('explicit window postcondition requires actual observed match', () => {
  const step = { action: 'open', target: 'notepad', expect: { windowTitleIncludes: 'Notepad' } };
  assert.equal(verifyStep(step, base, { ...base, windows: [{ title: 'Untitled - Notepad' }] }, { ok: true }).status, 'verified');
  assert.equal(verifyStep(step, base, { ...base, windows: [{ title: 'Explorer' }] }, { ok: true }).status, 'not-verified');
  assert.equal(verifyStep(step, base, { ...base, windows: null }, { ok: true }).status, 'unknown');
});

test('invalid driver return cannot be treated as verified', () => {
  const step = { action: 'open', expect: { windowTitleIncludes: 'Notepad' } };
  assert.equal(verifyStep(step, base, { windows: [{ title: 'Notepad' }] }, { ok: false }).status, 'failed');
});

test('observable focus and agent desktop conditions must all pass', () => {
  const step = { action: 'click', expect: { focusNameIncludes: 'Search', agentDesktopIncludes: 'Search' } };
  const after = { focus: { Name: 'Search box' }, agentDesktop: 'textbox Search' };
  assert.equal(verifyStep(step, base, after, { ok: true }).status, 'verified');
  assert.equal(verifyStep(step, base, { ...after, agentDesktop: '' }, { ok: true }).status, 'not-verified');
});

test('read-only action can succeed without a state change', () => {
  assert.equal(verifyStep({ action: 'observe' }, base, base, { ok: true }).status, 'verified');
});
