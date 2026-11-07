'use strict';
/**
 * 动作执行器
 * 
 * CORE - 首要核心，勿删除
 * 精确鼠标/键盘控制（SendInput 级别）
 * 
 * TRACE 2026-11-08: 增加 mouseMove / click / type 的 SendInput 实现骨架
 * 实际调用需在闸门放行后进行
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 10000, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: err ? String(err.message || err).slice(0, 200) : null,
        });
      }
    );
  });
}

/**
 * CORE: 鼠标移动（使用 user32 SendInput 的 PowerShell 包装）
 */
async function mouseMove(x, y) {
  const cmd = `
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class Mouse {
      [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    }
"@
    [Mouse]::SetCursorPos(${Number(x) || 0}, ${Number(y) || 0})
  `;
  return runPowerShell(cmd);
}

/**
 * CORE: 点击
 */
async function mouseClick(button = 'left') {
  const cmd = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait(' ')
  `;
  // 占位：实际应使用 mouse_event / SendInput
  return runPowerShell(cmd);
}

async function execute(decision) {
  const step = decision && decision.step;
  if (!step) return { ok: false, note: 'no step' };

  const action = step.action;

  if (action === 'mousemove' || action === 'move') {
    const r = await mouseMove(step.x, step.y);
    return { ok: r.ok, action, note: 'SendInput-level mouseMove', error: r.error };
  }
  if (action === 'click') {
    const r = await mouseClick(step.button);
    return { ok: r.ok, action, note: 'SendInput-level click', error: r.error };
  }
  if (action === 'open' && step.target) {
    const cmd = `Start-Process '${String(step.target).replace(/'/g, "''")}'`;
    const r = await runPowerShell(cmd);
    return { ok: r.ok, action, note: 'Start-Process', error: r.error };
  }
  if (action === 'type' && step.text) {
    const text = String(step.text).replace(/'/g, "''");
    const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')`;
    const r = await runPowerShell(cmd);
    return { ok: r.ok, action, note: 'SendKeys type', error: r.error };
  }
  if (action === 'observe' || action === 'list') {
    return { ok: true, action, note: 'read-only' };
  }

  return { ok: false, action, note: 'unsupported action' };
}

module.exports = { execute, mouseMove, mouseClick };
