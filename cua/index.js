'use strict';
/**
 * Windows CUA 主入口
 * 混合观察 → 决策 → 执行 → 验证 → 回写（支持多步 + 失败恢复）
 *
 * 用法: node cua/index.js
 * 
 * TRACE 2026-11-08: 主循环支持多步执行与失败重试
 * 参考：任务契约失败恢复 + OSWorld-Human 效率考虑
 */
const { observe } = require('./observer');
const { decide, loadTask, saveTask, advanceTask, recordFailure, shouldRetry } = require('./task');
const { execute } = require('./action');
const { supervise } = require('./supervisor');
const { checkGate } = require('./gate');

const MAX_STEPS = 20;

async function runOnce(task) {
  // 混合观察（截图 + AX）
  const observation = await observe({ includeAx: true });
  const decision = decide(task, observation);
  if (!decision) return { done: true, reason: 'no more steps', observation };

  const gate = checkGate(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason, gate.verdict);
    return { blocked: true, reason: gate.reason, gate, observation };
  }

  // 动作前提示：当前观察可能陈旧（对应截图陈旧研究）
  if (observation.screenshotError) {
    console.log('[CUA] warning: screenshot incomplete, action may be based on partial state');
  }

  const result = await execute(decision);
  const verified = await observe({ includeAx: true });
  const sup = await supervise({ task, decision, result, verified, gate });

  if (result && result.ok) {
    const nextTask = advanceTask(task);
    return { done: false, result, verified, nextTask, supervised: sup };
  }

  // 失败恢复
  const failedTask = recordFailure(task, result && result.error ? result.error : 'action failed');
  if (shouldRetry(failedTask)) {
    console.log('[CUA] retry available, retries=', failedTask.retries);
    return { done: false, result, verified, nextTask: failedTask, retried: true, supervised: sup };
  }

  return { done: true, reason: 'max retries exceeded', result, verified, nextTask: failedTask, supervised: sup };
}

async function main() {
  console.log('[CUA] core started (hybrid observe + multi-step)');

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
    console.log('[CUA] step', steps, JSON.stringify({ done: out.done, blocked: out.blocked, reason: out.reason, retried: out.retried }, null, 0));
    if (out.done || out.blocked) {
      console.log('[CUA] finished:', out.reason || 'blocked');
      break;
    }
    if (out.nextTask) current = out.nextTask;
    steps++;
    if (out.retried) continue;
    // 简单节流，避免过快点击
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
