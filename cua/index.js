'use strict';
/**
 * Windows CUA 主入口
 * 混合观察 → 决策 → 执行 → 验证 → 回写（支持多步 + 失败恢复）
 *
 * 用法: node cua/index.js
 * 
 * TRACE 2026-11-08: 主循环支持多步执行与失败重试
 * TRACE 2026-11-08+: 点击后使用 compareObservations 验证状态变化；支持 targetName 解析为坐标（减少纯坐标依赖）
 * 参考：任务契约失败恢复 + OSWorld-Human 效率考虑 + HCU 三通道
 */
const { observe, compareObservations, prepareVisionPayload } = require('./observer');
const { decide, loadTask, saveTask, advanceTask, recordFailure, shouldRetry } = require('./task');
const { execute } = require('./action');
const { supervise } = require('./supervisor');
const { checkGate } = require('./gate');
const { findElementsByName, parseBoundingRectangle } = require('./accessibility');
const { suggestFromVision } = require('./brain');

const MAX_STEPS = 20;

async function resolveStepCoordinates(step, observation) {
  if (!step || step.x != null || !step.targetName) return step;
  try {
    const found = await findElementsByName(step.targetName, 3);
    if (found.matches && found.matches.length > 0) {
      const el = found.matches[0];
      const rect = parseBoundingRectangle(el.BoundingRectangle);
      if (rect) {
        return {
          ...step,
          x: rect.centerX,
          y: rect.centerY,
          resolvedFrom: el.Name,
          resolvedNote: found.note,
        };
      }
    }
  } catch (e) {
    console.log('[CUA] resolve targetName failed:', e.message);
  }
  return step;
}

async function runOnce(task) {
  // 混合观察（截图 + AX）
  const observation = await observe({ includeAx: true });

  // 可选：外部大脑建议（如果配置了 API）
  let suggested = null;
  try {
    suggested = await suggestFromVision(prepareVisionPayload(observation), task);
  } catch (e) {
    console.log('[CUA] brain suggest skipped:', e.message);
  }

  let decision = decide(task, observation);
  if (suggested && suggested.step) {
    decision = { ...decision, step: suggested.step, fromBrain: true };
  }
  if (!decision) return { done: true, reason: 'no more steps', observation };

  // 解析名称为坐标（语义通道优先）
  if (decision.step) {
    decision.step = await resolveStepCoordinates(decision.step, observation);
  }

  const gate = checkGate(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason, gate.verdict);
    return { blocked: true, reason: gate.reason, gate, observation };
  }

  if (observation.screenshotError) {
    console.log('[CUA] warning: screenshot incomplete, action may be based on partial state');
  }

  const result = await execute(decision);
  const verified = await observe({ includeAx: true });
  const verification = compareObservations(observation, verified);

  const sup = await supervise({ task, decision, result, verified, gate, verification });

  if (result && result.ok) {
    const nextTask = advanceTask(task);
    return { done: false, result, verified, verification, nextTask, supervised: sup };
  }

  // 失败恢复
  const failedTask = recordFailure(task, result && result.error ? result.error : 'action failed');
  if (shouldRetry(failedTask)) {
    console.log('[CUA] retry available, retries=', failedTask.retries);
    return { done: false, result, verified, verification, nextTask: failedTask, retried: true, supervised: sup };
  }

  return { done: true, reason: 'max retries exceeded', result, verified, verification, nextTask: failedTask, supervised: sup };
}

async function main() {
  console.log('[CUA] core started (hybrid observe + multi-step + verification + name-resolve)');

  let task = loadTask();
  if (!task) {
    task = {
      id: 'demo-' + Date.now(),
      goal: 'observe windows then stop',
      steps: [{ action: 'observe' }],
      createdAt: Date.now(),
    };
    saveTask(task);
    console.log('[CUA] created default task');
  }

  let steps = 0;
  let current = task;
  while (steps < MAX_STEPS) {
    const out = await runOnce(current);
    console.log('[CUA] step', steps, JSON.stringify({ done: out.done, blocked: out.blocked, reason: out.reason, retried: out.retried, verified: out.verification && out.verification.note }, null, 0));
    if (out.done || out.blocked) {
      console.log('[CUA] finished:', out.reason || 'blocked');
      break;
    }
    if (out.nextTask) current = out.nextTask;
    steps++;
    if (out.retried) continue;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (steps >= MAX_STEPS) console.log('[CUA] reached max steps');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runOnce };
