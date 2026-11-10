'use strict';
/**
 * 动作执行器
 *
 * CORE - 首要核心，勿删除
 * 精确鼠标/键盘控制 + agent-desktop Accessibility Tree 通道 + FreeCAD 高质量 CAD
 */
const { execFile } = require('child_process');
const { recordHabit, isEnabled: habitsEnabled } = require('./habits');
const agentDesktop = require('./agent-desktop-tool');
const freecad = require('./freecad-tool');

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
  if (typeof x !== 'number' || typeof y !== 'number' ||
      !Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: 'invalid coordinates' };
  }
  const nx = Math.round(x);
  const ny = Math.round(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return { ok: false, error: 'invalid coordinates' };
  }
  const cmd = `${MOUSE_EVENT_HELPER}
if (-not [Input]::SetCursorPos(${nx}, ${ny})) { throw 'SetCursorPos failed' }`;
  const r = await runPowerShell(cmd);
  if (r.ok) maybeRecord('mouse', 'move', { x: nx, y: ny });
  return r;
}

async function mouseClick(button = 'left', x, y, useCurrentCursor = false) {
  if (!['left', 'right'].includes(button)) return { ok: false, error: 'invalid mouse button' };
  if (!useCurrentCursor && (!Number.isFinite(x) || !Number.isFinite(y))) {
    return { ok: false, error: 'click requires explicit coordinates' };
  }
  if (x !== undefined || y !== undefined) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: 'invalid click coordinates' };
    }
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

function toSendKeysLiteral(value) {
  // WinForms SendKeys treats + ^ % ~ ( ) { } as keyboard shortcuts.
  return value.replace(/[+^%~(){}]/g, char => '{' + char + '}');
}

async function typeText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'empty text' };
  }
  if (text.length > 500) return { ok: false, error: 'text too long for SendKeys channel' };
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    return { ok: false, error: 'control characters require semantic typing channel' };
  }
  const safe = toSendKeysLiteral(text).replace(/'/g, "''");
  const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')`;
  const r = await runPowerShell(cmd);
  if (r.ok) maybeRecord('key', 'type', { length: text.length });
  return r;
}

async function execute(decision) {
  const step = decision && decision.step;
  if (!step || !step.action) return { ok: false, note: 'invalid step' };

  const action = String(step.action).toLowerCase();

  // agent-desktop 核心通道优先
  if (action.startsWith('ad-') || action === 'snapshot' || action === 'click-ref' || action === 'type-ref' || action === 'press') {
    const r = await agentDesktop.executeStep(step);
    if (r.ok) maybeRecord('agent-desktop', action, { ref: step.ref || step.target });
    return { ok: r.ok, action, note: 'agent-desktop', error: r.error, stdout: r.stdout };
  }

  // FreeCAD 高质量 CAD 通道
  if (action.startsWith('fc-') || action === 'freecad' || action === 'fc-box' || action === 'fc-step') {
    let r;
    if (action === 'fc-box' || action === 'fc-create-box') {
      r = await freecad.createVerifiedBox({ length: step.length ?? 50, width: step.width ?? 30, height: step.height ?? 20, outPath: step.outPath });
    } else if (action === 'fc-script' || action === 'fc-run') {
      r = await freecad.runScript(step.scriptPath || step.target);
    } else if (action === 'fc-step' || action === 'fc-export-step') {
      r = await freecad.exportStep({ fcstdPath: step.fcstd || step.target, outPath: step.outPath });
    } else {
      r = await freecad.runScript(step.scriptPath || step.target);
    }
    if (r.ok) maybeRecord('freecad', action, { path: step.outPath });
    return { ok: r.ok, action, note: 'freecad', error: r.error, stdout: r.stdout };
  }

  try {
    if (action === 'mousemove' || action === 'move') {
      const r = await mouseMove(step.x, step.y);
      return { ok: r.ok, action, note: 'mouseMove', error: r.error };
    }
    if (action === 'click') {
      const r = await mouseClick(step.button || 'left', step.x, step.y, step.useCurrentCursor === true);
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

module.exports = { execute, mouseMove, mouseClick, typeText, toSendKeysLiteral, agentDesktop, freecad };
