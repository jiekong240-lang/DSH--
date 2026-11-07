'use strict';
/**
 * 权限闸门
 * 对齐 / 复用 sentinel/gate.cjs 思路。
 * 
 * TRACE 2026-11-08: 映射 CUA 动作到 sentinel LEVELS，调用其 decide()
 * L3 默认拒绝（需 humanConfirmed），L0 放行
 */
const sentinelGate = require('../sentinel/gate.cjs');

const ACTION_TO_TOOL = {
  observe: 'collect_metrics',
  list: 'collect_metrics',
  open: 'run_command',       // L3
  type: 'run_command',       // L3
  click: 'run_command',      // L3
  delete: 'run_command',     // L3
  system: 'run_command',     // L3
  network: 'run_command',    // L3
  notify: 'notify',          // L1
};

function checkGate(decision, ctx = {}) {
  const action = decision && decision.step && decision.step.action;
  const tool = ACTION_TO_TOOL[action] || null;
  if (!tool) {
    return { allow: false, reason: 'unregistered action', level: null, verdict: 'BLOCKED_UNREGISTERED' };
  }

  const gateCtx = {
    mode: 'assist',
    humanConfirmed: !!ctx.humanConfirmed,
    approved: !!ctx.approved,
    quietNow: false,
    toastLeft: 20,
    grants: ctx.grants || [],
    ...ctx,
  };

  const d = sentinelGate.decide(tool, decision.step || {}, gateCtx);
  return {
    allow: d.verdict === 'ALLOW',
    reason: d.reason,
    level: d.level,
    verdict: d.verdict,
  };
}

module.exports = { checkGate };
