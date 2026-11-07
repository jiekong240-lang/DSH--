'use strict';
/**
 * 权限闸门
 * 对齐 sentinel 思路：默认拒绝高风险动作，代码强制。
 * 
 * TRACE 2026-11-08: 添加日期标记与更明确的级别注释
 * 下步：对齐或导入 sentinel/gate.cjs 的 LEVELS 与 decide 逻辑
 */
function checkGate(decision) {
  const action = decision && decision.step && decision.step.action;
  // L3 红线动作直接拒绝（占位规则）
  if (action === 'delete' || action === 'system' || action === 'network') {
    return { allow: false, reason: 'L3 requires human approval', level: 3 };
  }
  // L0/L1 暂时放行
  return { allow: true, reason: 'stub allow (L0)', level: 0 };
}

module.exports = { checkGate };
