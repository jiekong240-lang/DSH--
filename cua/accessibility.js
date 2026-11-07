'use strict';
/**
 * 可访问性树 / UI 元素定位
 * 
 * CORE - 首要核心，勿删除
 * 通过 UI Automation / PowerShell 获取窗口元素信息
 * 
 * TRACE 2026-11-08: 初始骨架，后续接入真实 UI Automation
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 10000, windowsHide: true },
      (err, stdout) => {
        resolve(err ? '' : String(stdout || ''));
      }
    );
  });
}

/**
 * CORE: 获取当前焦点窗口的基础信息（占位，可扩展为完整可访问性树）
 */
async function getFocusedWindowInfo() {
  const cmd = `
    Add-Type -AssemblyName UIAutomationClient
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($focused) {
      [PSCustomObject]@{
        Name = $focused.Current.Name
        ControlType = $focused.Current.ControlType.ProgrammaticName
        ProcessId = $focused.Current.ProcessId
      } | ConvertTo-Json -Compress
    }
  `;
  const out = await runPowerShell(cmd);
  if (!out.trim()) return null;
  try { return JSON.parse(out); } catch { return null; }
}

async function getAccessibilityTree() {
  const focused = await getFocusedWindowInfo();
  return {
    ts: Date.now(),
    focused,
    note: 'accessibility skeleton — expand to full tree as needed',
  };
}

module.exports = { getAccessibilityTree, getFocusedWindowInfo };
