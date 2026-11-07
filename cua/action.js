'use strict';
/**
 * 动作执行器
 * 
 * TRACE 2026-11-08: 接入基础真实输入（PowerShell SendKeys / Start-Process）
 * 仅在闸门放行后调用。高风险动作仍受闸门约束。
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

async function execute(decision) {
  const step = decision && decision.step;
  if (!step) return { ok: false, note: 'no step' };

  const action = step.action;
  let cmd = '';

  if (action === 'open' && step.target) {
    cmd = `Start-Process '${String(step.target).replace(/'/g, "''")}'`;
  } else if (action === 'type' && step.text) {
    const text = String(step.text).replace(/'/g, "''");
    cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')`;
  } else if (action === 'observe' || action === 'list') {
    return { ok: true, action, note: 'observe/list is read-only, no input sent' };
  } else {
    return { ok: false, action, note: 'unsupported or gated action', error: 'not implemented' };
  }

  const r = await runPowerShell(cmd);
  return {
    ok: r.ok,
    action,
    note: r.ok ? 'real PowerShell input executed' : 'PowerShell failed',
    error: r.error,
    stdout: r.stdout.slice(0, 200),
  };
}

module.exports = { execute };
