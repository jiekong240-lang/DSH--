'use strict';
/**
 * 外部 API 大脑骨架
 * 
 * CORE 边界：视觉理解与规划走外部 API，本地只负责观察与执行
 * 
 * TRACE 2026-11-08: 初始骨架。使用 prepareVisionPayload 构建请求，支持 CUA_VISION_API 环境变量。
 * 若未配置 API，返回 null，上层回退到本地 task.decide。
 * 
 * 预期请求：POST JSON { payload, taskGoal, currentSteps }
 * 预期响应：{ step: { action, x, y, text, targetName, ... }, confidence, note }
 */
const { prepareVisionPayload } = require('./observer');

async function suggestFromVision(payload, task) {
  const apiUrl = process.env.CUA_VISION_API || process.env.CUA_BRAIN_API;
  if (!apiUrl) {
    return null; // 未配置，使用本地决策
  }

  const body = {
    payload: payload || {},
    goal: task && task.goal,
    remainingSteps: task && task.steps,
    ts: Date.now(),
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log('[CUA brain] API status', res.status);
      return null;
    }
    const data = await res.json();
    if (data && data.step && data.step.action) {
      return {
        step: data.step,
        confidence: data.confidence || null,
        note: data.note || 'from external brain',
      };
    }
    return null;
  } catch (e) {
    console.log('[CUA brain] call failed:', e.message);
    return null;
  }
}

module.exports = { suggestFromVision };
