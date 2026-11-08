'use strict';
/**
 * Windows CUA 主入口
 * 混合观察 → 决策 → 执行 → 验证 → 回写（支持多步 + 失败恢复）
 *
 * agent-desktop 深度参与：观察带 @ref、执行优先走 ad-* 通道、验证时对比树变化
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
  // 优先尝试 agent-desktop @ref（如果观察里已有快照）
  if (observation.agentDesktop && step.targetName) {
    // 简单名称匹配提示（实际解析可后续加强）
    step.preferAgentDesktop = true;
  }
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
  // 混合观察（含 agent-desktop，如果任务指定了 app）
  const observation = await observe({
    includeAx: true,
    app: task.app || task.adApp,
  });

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

  if (decision.step) {
    decision.step = await resolveStepCoordinates(decision.step, observation);
  }

  const gate = checkGate(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason, gate.verdict);
    return { blocked: true, reason: gate.reason, gate, observation };
  }

  if (observation.screenshotError) {
    console.log('[CUA] warning: screenshot incomplete');
  }

  const result = await execute(decision);
  const verified = await observe({
    includeAx: true,
    app: task.app || task.adApp,
  });
  const verification = compareObservations(observation, verified);

  const sup = await supervise({ task, decision, result, verified, gate, verification });

  if (result && result.ok) {
    const nextTask = advanceTask(task);
    return { done: false, result, verified, verification, nextTask, supervised: sup };
  }

  const failedTask = recordFailure(task, result && result.error ? result.error : 'action failed');
  if (shouldRetry(failedTask)) {
    console.log('[CUA] retry available, retries=', failedTask.retries);
    return { done: false, result, verified, verification, nextTask: failedTask, retried: true, supervised: sup };
  }

  return { done: true, reason: 'max retries exceeded', result, verified, verification, nextTask: failedTask, supervised: sup };
}

async function main() {
  console.log('[CUA] core started (agent-desktop deep + hybrid observe + multi-step + verification)');

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
    console.log('[CUA] step', steps, JSON.stringify({
      done: out.done,
      blocked: out.blocked,
      reason: out.reason,
      retried: out.retried,
      ad: !!(out.verification && out.verification.adChanged),
    }, null, 0));
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
