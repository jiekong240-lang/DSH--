'use strict';
/**
 * 可访问性树 / UI 元素定位
 * 
 * CORE - 首要核心，勿删除
 * 通过 UI Automation 获取窗口元素信息
 * 
 * TRACE 2026-11-08: 提升质量
 * - 更完整的元素属性
 * - 错误处理
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        resolve({
          ok: !err,
          stdout: String(stdout || '').trim(),
          error: err ? String(err.message || err).slice(0, 300) : null,
        });
      }
    );
  });
}

async function getFocusedWindowInfo() {
  const cmd = `
    try {
      Add-Type -AssemblyName UIAutomationClient
      $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
      if ($focused) {
        [PSCustomObject]@{
          Name = $focused.Current.Name
          ControlType = $focused.Current.ControlType.ProgrammaticName
          ProcessId = $focused.Current.ProcessId
          ClassName = $focused.Current.ClassName
          IsEnabled = $focused.Current.IsEnabled
          BoundingRectangle = $focused.Current.BoundingRectangle.ToString()
        } | ConvertTo-Json -Compress
      }
    } catch {
      Write-Error $_.Exception.Message
    }
  `;
  const r = await runPowerShell(cmd);
  if (!r.ok || !r.stdout) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

async function getAccessibilityTree() {
  const focused = await getFocusedWindowInfo();
  return {
    ts: Date.now(),
    focused,
    note: focused ? 'focused element retrieved' : 'no focused element',
  };
}

module.exports = { getAccessibilityTree, getFocusedWindowInfo };
