'use strict';
/**
 * 可访问性树 / UI 元素定位
 * 
 * CORE - 首要核心，勿删除
 * 通过 UI Automation 获取窗口元素信息（混合观察通道）
 * 
 * TRACE 2026-11-08: 浅层树遍历 + 错误处理加强
 * 参考 HCU：语义通道补充视觉，减少失效点击
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 15000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
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

/**
 * 浅层可访问性树（焦点窗口 + 前 N 个子元素）
 * 供 API 大脑做接地（grounding）时使用
 */
async function getAccessibilityTree(maxChildren = 12) {
  const focused = await getFocusedWindowInfo();
  if (!focused) {
    return { ts: Date.now(), focused: null, children: [], note: 'no focused element' };
  }

  const cmd = `
    try {
      Add-Type -AssemblyName UIAutomationClient
      $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $children = @()
      $child = $walker.GetFirstChild($focused)
      $count = 0
      while ($child -and $count -lt ${maxChildren}) {
        $children += [PSCustomObject]@{
          Name = $child.Current.Name
          ControlType = $child.Current.ControlType.ProgrammaticName
          ClassName = $child.Current.ClassName
          IsEnabled = $child.Current.IsEnabled
          BoundingRectangle = $child.Current.BoundingRectangle.ToString()
        }
        $child = $walker.GetNextSibling($child)
        $count++
      }
      $children | ConvertTo-Json -Compress
    } catch {
      Write-Error $_.Exception.Message
    }
  `;
  const r = await runPowerShell(cmd);
  let children = [];
  if (r.ok && r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout);
      children = Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* ignore */ }
  }

  return {
    ts: Date.now(),
    focused,
    children,
    note: `shallow tree: focused + ${children.length} children`,
  };
}

module.exports = { getAccessibilityTree, getFocusedWindowInfo };
