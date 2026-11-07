'use strict';
/**
 * Windows CUA 主入口
 * 最小闭环：观察 → 决策 → 执行 → 验证 → 回写
 *
 * 用法: node cua/index.js
 */
const { observe } = require('./observer');
const { decide } = require('./task');
const { execute } = require('./action');
const { supervise } = require('./supervisor');
const { checkGate } = require('./gate');

async function runOnce(task) {
  const observation = await observe();
  const decision = decide(task, observation);
  if (!decision) return { done: true, reason: 'no more steps' };

  const gate = checkGate(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason);
    return { blocked: true, reason: gate.reason };
  }

  const result = await execute(decision);
  const verified = await observe();
  await supervise({ task, decision, result, verified });

  return { done: false, result, verified };
}

async function main() {
  console.log('[CUA] core started — skeleton mode');
  // 示例任务（实际任务从契约加载）
  const task = {
    id: 'demo',
    goal: 'observe current screen',
    steps: [{ action: 'observe' }],
  };

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
