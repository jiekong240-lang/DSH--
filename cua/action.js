'use strict';
/**
 * 动作执行器
 * 
 * CORE - 首要核心，勿删除
 * 精确鼠标/键盘控制（SendInput / mouse_event 级别）
 * 
 * TRACE 2026-11-08: 可选习惯记录集成 + 更清晰返回
 */
const { execFile } = require('child_process');
const { recordHabit, isEnabled: habitsEnabled } = require('./habits');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          error: err ? String(err.message || err).slice(0, 300) : null,
        });
      }
    );
  });
}

const MOUSE_EVENT_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Input {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP = 0x0004;
  public const uint RIGHTDOWN = 0x0008;
  public const uint RIGHTUP = 0x0010;
}
"@
`;

function maybeRecord(type, action, extra = {}) {
  if (!habitsEnabled()) return;
  try {
    recordHabit({ type, action, ...extra });
  } catch { /* ignore */ }
}

async function mouseMove(x, y) {
  const nx = Math.round(Number(x));
  const ny = Math.round(Number(y));
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return { ok: false, error: 'invalid coordinates' };
  }
  const cmd = `${MOUSE_EVENT_HELPER}
[Input]::SetCursorPos(${nx}, ${ny})`;
  const r = await runPowerShell(cmd);
  if (r.ok) maybeRecord('mouse', 'move', { x: nx, y: ny });
  return r;
}

async function mouseClick(button = 'left', x, y) {
  if (x !== undefined && y !== undefined) {
    const moved = await mouseMove(x, y);
    if (!moved.ok) return moved;
  }
  const flagDown = button === 'right' ? 'RIGHTDOWN' : 'LEFTDOWN';
  const flagUp = button === 'right' ? 'RIGHTUP' : 'LEFTUP';
  const cmd = `${MOUSE_EVENT_HELPER}
[Input]::mouse_event([Input]::${flagDown}, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[Input]::mouse_event([Input]::${flagUp}, 0, 0, 0, [UIntPtr]::Zero)`;
  const r = await runPowerShell(cmd);
  if (r.ok) maybeRecord('mouse', 'click', { x, y, meta: button });
  return r;
}

async function typeText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'empty text' };
  }
  const safe = text.replace(/'/g, "''").slice(0, 500);
  const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')`;
  const r = await runPowerShell(cmd);
  if (r.ok) maybeRecord('key', 'type', { length: text.length });
  return r;
}

async function execute(decision) {
  const step = decision && decision.step;
  if (!step || !step.action) return { ok: false, note: 'invalid step' };

  const action = String(step.action).toLowerCase();

  try {
    if (action === 'mousemove' || action === 'move') {
      const r = await mouseMove(step.x, step.y);
      return { ok: r.ok, action, note: 'mouseMove', error: r.error };
    }
    if (action === 'click') {
      const r = await mouseClick(step.button || 'left', step.x, step.y);
      return { ok: r.ok, action, note: 'mouseClick', error: r.error };
    }
    if (action === 'type' && step.text) {
      const r = await typeText(step.text);
      return { ok: r.ok, action, note: 'type', error: r.error };
    }
    if (action === 'open' && step.target) {
      const safe = String(step.target).replace(/'/g, "''");
      const r = await runPowerShell(`Start-Process '${safe}'`);
      return { ok: r.ok, action, note: 'open', error: r.error };
    }
    if (action === 'observe' || action === 'list') {
      return { ok: true, action, note: 'read-only' };
    }
    return { ok: false, action, note: 'unsupported action' };
  } catch (e) {
    return { ok: false, action, error: String(e.message || e).slice(0, 200) };
  }
}

module.exports = { execute, mouseMove, mouseClick, typeText };
