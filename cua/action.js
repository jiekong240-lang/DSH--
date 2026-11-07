'use strict';
/**
 * 动作执行器
 * 鼠标、键盘、窗口操作。当前为占位。
 * 
 * TRACE 2026-11-08: 添加日期标记
 * TODO: 接入 SendInput / mouse_event / 或 PowerShell 模拟输入
 * 注意：所有真实动作必须先过 gate
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
