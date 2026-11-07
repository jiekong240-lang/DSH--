'use strict';
/**
 * Windows CUA 主入口
 * 最小闭环：观察 → 决策 → 执行 → 验证 → 回写
 *
 * 用法: node cua/index.js
 * 
 * TRACE 2026-11-08: 接入任务持久化与对齐后的闸门
 */
const { observe } = require('./observer');
const { decide, loadTask, saveTask, advanceTask } = require('./task');
const { execute } = require('./action');
const { supervise } = require('./supervisor');
const { checkGate } = require('./gate');

async function runOnce(task) {
  const observation = await observe();
  const decision = decide(task, observation);
  if (!decision) return { done: true, reason: 'no more steps', observation };

  const gate = checkGate(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason, gate.verdict);
    return { blocked: true, reason: gate.reason, gate, observation };
  }

  const result = await execute(decision);
  const verified = await observe();
  await supervise({ task, decision, result, verified });

  const nextTask = advanceTask(task);
  return { done: false, result, verified, nextTask };
}

async function main() {
  console.log('[CUA] core started');

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

  const out = await runOnce(task);
  console.log('[CUA] result:', JSON.stringify(out, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runOnce };
