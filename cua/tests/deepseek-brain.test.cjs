'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestFromVision } = require('../brain');
const { prepareVisionPayload } = require('../observer');

const task = { id: 'a', goal: 'Click Save', steps: [{ action: 'click', targetName: 'Save' }] };
const payload = { screenshot: 'C:\\private\\shot.png', windows: [{ title: 'Editor' }],
  accessibility: { focused: { Name: 'Editor' }, children: [{ Name: 'Save' }] },
  agentDesktopSummary: '#1 button Save', channels: { semantic: true } };

test('direct DeepSeek semantic API sees real UIA data but never fake image bytes', async () => {
  let call;
  const result = await suggestFromVision(payload, task, {
    env: { DEEPSEEK_API_KEY: 'dummy-key', DEEPSEEK_BASE_URL: 'https://unit.invalid' },
    fetchImpl: async (url, init) => {
      call = { url, init, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [
        { message: { content: '{"step":{"action":"click","ref":"#1"},"confidence":0.8}' } }
      ] }) };
    },
  });
  assert.equal(call.url, 'https://unit.invalid/chat/completions');
  assert.equal(call.init.headers.Authorization, 'Bearer dummy-key');
  assert.equal(call.body.messages[1].content.includes('Save'), true);
  assert.equal(call.body.messages[1].content.includes('shot.png'), false);
  assert.equal(result.mode, 'deepseek-semantic');
  assert.equal(result.step.ref, '#1');
});

test('no task step sends no API request', async () => {
  let calls = 0;
  const result = await suggestFromVision(payload, { steps: [] }, {
    env: { DEEPSEEK_API_KEY: 'x' },
    fetchImpl: async () => { calls++; return {}; },
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('model changing planned action is rejected', async () => {
  const result = await suggestFromVision(payload, task, {
    env: { DEEPSEEK_API_KEY: 'x' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [
      { message: { content: '{"step":{"action":"delete","target":"C:\\\\tmp"}}' } }
    ] }) }),
  });
  assert.equal(result, null);
});

test('external visual endpoint remains compatible', async () => {
  const result = await suggestFromVision(payload, task, {
    env: { CUA_VISION_API: 'https://unit.invalid/vision' },
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://unit.invalid/vision');
      assert.equal(JSON.parse(init.body).goal, 'Click Save');
      return { ok: true, json: async () => ({ step: { action: 'click', ref: '#1' } }) };
    },
  });
  assert.equal(result.mode, 'external-vision');
});

test('observer provides meaningful structured UI data to semantic planner', () => {
  const prepared = prepareVisionPayload({
    ts: 123, screenshot: 'private.png',
    windows: [{ title: 'Untitled - Notepad', process: 'notepad.exe' }],
    accessibility: { focused: { Name: 'Editor' }, children: [{ Name: 'Save', BoundingRectangle: 'X=0,Y=0,Width=40,Height=30' }] },
    agentDesktop: '#1 Save',
  });
  assert.equal(prepared.windows[0].title, 'Untitled - Notepad');
  assert.equal(prepared.accessibility.children.length, 1);
});
