'use strict';
/**
 * 任务契约与决策
 * 状态机、步骤选择、失败处理。
 */
function decide(task, observation) {
  if (!task || !task.steps || task.steps.length === 0) return null;
  const next = task.steps[0];
  return {
    taskId: task.id,
    step: next,
    observationSummary: observation.note,
  };
}

module.exports = { decide };
