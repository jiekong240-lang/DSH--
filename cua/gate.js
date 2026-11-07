'use strict';
/**
 * 权限闸门
 * 对齐 sentinel 思路：默认拒绝高风险动作，代码强制。
 */
function checkGate(decision) {
  const action = decision && decision.step && decision.step.action;
  // 占位：所有动作暂时放行，后续按 L0-L3 分级
  if (action === 'delete' || action === 'system') {
    return { allow: false, reason: 'L3 requires human approval', level: 3 };
  }
  return { allow: true, reason: 'stub allow', level: 0 };
}

module.exports = { checkGate };
