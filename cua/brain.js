'use strict';
/**
 * Semantic CUA planning through DeepSeek API, or an existing dedicated
 * CUA_VISION_API endpoint. DeepSeek-chat consumes TEXT/UIA snapshots only:
 * local screenshot paths are NOT image pixels and are never represented as
 * visual evidence. A separate vision-capable endpoint is needed for images.
 */
const { randomUUID } = require('node:crypto');

async function suggestFromVision(payload, task, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const next = Array.isArray(task?.steps) ? task.steps[0] : null;
  if (!next || typeof next.action !== 'string') return null;

  const visionUrl = env.CUA_VISION_API || env.CUA_BRAIN_API;
  const deepseek = !visionUrl && !!env.DEEPSEEK_API_KEY;
  if (!visionUrl && !deepseek) return null;

  let url, body, headers;
  if (visionUrl) {
    url = visionUrl;
    headers = { 'Content-Type': 'application/json' };
    body = {
      payload: payload || {}, goal: task.goal,
      remainingSteps: task.steps, ts: Date.now(),
    };
  } else {
    url = String(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '') + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY,
    };
    const observation = {
      // Important: path-only screenshots are omitted: DeepSeek-chat is text.
      focus: payload?.focus || null,
      accessibility: payload?.accessibility || null,
      accessibilitySummary: payload?.accessibilitySummary || null,
      windows: payload?.windows || [],
      agentDesktopSummary: payload?.agentDesktopSummary || null,
      channels: payload?.channels || {},
    };
    body = {
      model: env.DEEPSEEK_CUA_MODEL || env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content:
          'You ground a Windows UI action in an accessibility snapshot. ' +
          'Reply only as JSON: {"step":{"action":"<same action as planned>",' +
          '"ref":"<observed element reference if present>","x":0,"y":0},' +
          '"confidence":0.0,"note":"short"}. ' +
          'Do not invent coordinates or references. Do not modify text, action, target or expected result. ' +
          'If insufficient data, reply {"step":null,"note":"insufficient UI evidence"}.'
        },
        { role: 'user', content: JSON.stringify({
          goal: task.goal, plannedStep: next,
          semanticObservation: observation,
        }) },
      ],
    };
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST', headers,
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn('[CUA brain] API status', response.status);
      return null;
    }
    const data = await response.json();
    let candidate = data;
    if (deepseek) {
      const content = data?.choices?.[0]?.message?.content;
      candidate = typeof content === 'string' ? JSON.parse(content) : null;
    }
    const step = candidate?.step;
    if (!step || typeof step.action !== 'string' ||
        step.action.toLowerCase() !== next.action.toLowerCase()) return null;
    return {
      step,
      confidence: Number.isFinite(candidate.confidence) ? candidate.confidence : null,
      note: candidate.note || (deepseek ? 'DeepSeek semantic UI grounding' : 'external vision API'),
      mode: deepseek ? 'deepseek-semantic' : 'external-vision',
    };
  } catch (error) {
    console.warn('[CUA brain] call failed:', String(error.message || error));
    return null;
  }
}

module.exports = { suggestFromVision };
