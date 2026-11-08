'use strict';
/**
 * 可访问性树 / UI 元素定位
 * 
 * CORE - 首要核心，勿删除
 * 通过 UI Automation 获取窗口元素信息（混合观察通道）
 * 
 * TRACE 2026-11-08: 添加按名称搜索、可点击元素提取、更好的错误处理
 * TRACE 2026-11-08+: 添加 BoundingRectangle 解析器，供名称点击坐标推断
 * 参考 HCU：语义通道补充视觉，减少失效点击；对齐进度日志优先项 1
 */
const { execFile } = require('child_process');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 20000, windowsHide: true, maxBuffer: 3 * 1024 * 1024 },
      (err, stdout) => {
        resolve({
          ok: !err,
          stdout: String(stdout || '').trim(),
          error: err ? String(err.message || err).slice(0, 400) : null,
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

/**
 * 按名称（模糊匹配）搜索焦点窗口内的元素
 * 返回带 BoundingRectangle 的候选，供点击使用
 */
async function findElementsByName(namePattern, maxResults = 8) {
  if (!namePattern || typeof namePattern !== 'string') {
    return { ts: Date.now(), matches: [], note: 'invalid pattern' };
  }
  const safe = namePattern.replace(/'/g, "''").slice(0, 80);
  const cmd = `
    try {
      Add-Type -AssemblyName UIAutomationClient
      $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
      if (-not $focused) { exit }
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $matches = @()
      function Search($el, $depth) {
        if ($depth -gt 3 -or $matches.Count -ge ${maxResults}) { return }
        $name = $el.Current.Name
        if ($name -and $name -like '*${safe}*') {
          $matches += [PSCustomObject]@{
            Name = $name
            ControlType = $el.Current.ControlType.ProgrammaticName
            ClassName = $el.Current.ClassName
            IsEnabled = $el.Current.IsEnabled
            BoundingRectangle = $el.Current.BoundingRectangle.ToString()
          }
        }
        $child = $walker.GetFirstChild($el)
        while ($child -and $matches.Count -lt ${maxResults}) {
          Search $child ($depth + 1)
          $child = $walker.GetNextSibling($child)
        }
      }
      Search $focused 0
      $matches | ConvertTo-Json -Compress
    } catch {
      Write-Error $_.Exception.Message
    }
  `;
  const r = await runPowerShell(cmd);
  let matches = [];
  if (r.ok && r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout);
      matches = Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* ignore */ }
  }
  return {
    ts: Date.now(),
    pattern: namePattern,
    matches,
    note: `found ${matches.length} elements matching '${namePattern}'`,
  };
}

/**
 * 提取焦点窗口内可点击/可输入的元素（Button, Edit, ListItem 等）
 */
async function getClickableElements(max = 10) {
  const tree = await getAccessibilityTree(Math.max(max, 16));
  const clickableTypes = ['Button', 'Edit', 'ListItem', 'MenuItem', 'CheckBox', 'RadioButton', 'Hyperlink'];
  const filtered = (tree.children || []).filter((c) => {
    const t = String(c.ControlType || '').toLowerCase();
    return clickableTypes.some((ct) => t.includes(ct.toLowerCase()));
  }).slice(0, max);
  return {
    ts: Date.now(),
    focused: tree.focused,
    clickable: filtered,
    note: `extracted ${filtered.length} potentially clickable elements`,
  };
}

/**
 * 解析 BoundingRectangle 字符串为坐标与中心点
 * 支持常见格式："X=100,Y=200,Width=50,Height=30" 或 "{X=100, Y=200, Width=50, Height=30}"
 * 返回 { x, y, width, height, centerX, centerY } 或 null
 */
function parseBoundingRectangle(rectStr) {
  if (!rectStr || typeof rectStr !== 'string') return null;
  const cleaned = rectStr.replace(/[{}]/g, '').replace(/\s+/g, '');
  const parts = {};
  for (const pair of cleaned.split(',')) {
    const [k, v] = pair.split('=');
    if (k && v) parts[k.trim().toLowerCase()] = parseFloat(v);
  }
  const x = parts.x;
  const y = parts.y;
  const w = parts.width;
  const h = parts.height;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
    centerX: Math.round(x + w / 2),
    centerY: Math.round(y + h / 2),
  };
}

module.exports = {
  getAccessibilityTree,
  getFocusedWindowInfo,
  findElementsByName,
  getClickableElements,
  parseBoundingRectangle,
};
