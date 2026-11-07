'use strict';
/**
 * 动作执行器
 * 鼠标、键盘、窗口操作。当前为占位。
 */
async function execute(decision) {
  console.log('[CUA action]', decision);
  // TODO: 调用 Windows 原生或 PowerShell 执行真实动作
  return {
    ok: true,
    action: decision,
    note: 'action stub — no real input sent',
  };
}

module.exports = { execute };
