'use strict';
/**
 * 屏幕与窗口观察
 * 
 * TRACE 2026-11-08: 接入 PowerShell 真实窗口枚举
 * 使用 Get-Process 过滤有 MainWindowTitle 的进程
 * TODO: 截图、焦点窗口、UI Automation
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve('');
        resolve(String(stdout || ''));
      }
    );
  });
}

async function enumerateWindows() {
  const cmd = `
    Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne '' } |
    Select-Object ProcessName, Id, MainWindowTitle |
    ConvertTo-Json -Compress
  `;
  const out = await runPowerShell(cmd);
  if (!out.trim()) return [];
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function observe() {
  const windows = await enumerateWindows();
  return {
    ts: Date.now(),
    screenshot: null, // TODO: 实际截图
    windows: windows.map((w) => ({
      process: w.ProcessName,
      pid: w.Id,
      title: w.MainWindowTitle,
    })),
    focus: null,
    note: `observer: enumerated ${windows.length} windows via PowerShell`,
  };
}

module.exports = { observe, enumerateWindows };
