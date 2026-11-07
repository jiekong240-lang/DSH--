'use strict';
/**
 * 监督循环
 * 检查执行结果、记录审计、决定是否重试或中止。
 */
async function supervise(ctx) {
  console.log('[CUA supervisor]', {
    task: ctx.task.id,
    step: ctx.decision.step,
    resultOk: ctx.result && ctx.result.ok,
  });
  // TODO: 写审计日志、更新任务状态、判断是否需要人工介入
  return { continued: true };
}

module.exports = { supervise };
