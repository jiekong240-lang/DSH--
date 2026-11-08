'use strict';
/**
 * 屏幕与窗口观察
 * 
 * CORE - 首要核心，勿删除
 * 屏幕截图 + 视觉理解接口（截图本地完成，视觉理解走 API）
 * 混合观察：截图 + 窗口枚举 + 可访问性浅层树
 * 
 * TRACE 2026-11-08: 多屏支持 + 状态一致性辅助 + 视觉 API 载荷准备
 * 参考 OSWorld / HCU 观察协议 + 截图陈旧研究 (2610.39282)
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAccessibilityTree, findElementsByName, getClickableElements } = require('./accessibility');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 25000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
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

async function enumerateWindows() {
  const cmd = `
    Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne '' } |
    Select-Object ProcessName, Id, MainWindowTitle |
    ConvertTo-Json -Compress
  `;
  const r = await runPowerShell(cmd);
  if (!r.ok || !r.stdout) return [];
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/**
 * 截取虚拟屏幕（所有监视器的合并范围）
 * 比 PrimaryScreen 更适合多显示器家用机
 */
async function takeScreenshot() {
  const dir = path.join(__dirname, '..', 'logs', 'screenshots');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { path: null, error: 'mkdir failed: ' + e.message };
  }
  const file = path.join(dir, `screen-${Date.now()}.png`);
  const fileEsc = file.replace(/\\/g, '\\');
  const cmd = `
    try {
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      }
      $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bmp.Save('${fileEsc}', [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      if (Test-Path '${fileEsc}') { Write-Output '${fileEsc}' }
    } catch {
      Write-Error $_.Exception.Message
    }
  `;
  const r = await runPowerShell(cmd);
  if (r.ok && r.stdout && fs.existsSync(r.stdout)) {
    return { path: r.stdout, error: null, bounds: 'virtual' };
  }
  return { path: null, error: r.error || 'screenshot failed' };
}

/**
 * 混合观察：截图 + 窗口 + AX 浅层树
 * 供外部 API 大脑同时获得视觉与语义通道
 */
async function observe(options = {}) {
  const includeAx = options.includeAx !== false;
  const [windows, shot, ax] = await Promise.all([
    enumerateWindows(),
    takeScreenshot(),
    includeAx ? getAccessibilityTree(options.maxAxChildren || 12) : Promise.resolve(null),
  ]);

  return {
    ts: Date.now(),
    screenshot: shot.path,
    screenshotError: shot.error,
    screenshotBounds: shot.bounds || null,
    windows: windows.map((w) => ({
      process: w.ProcessName,
      pid: w.Id,
      title: w.MainWindowTitle,
    })),
    accessibility: ax,
    focus: ax && ax.focused ? ax.focused : null,
    note: `observer: ${windows.length} windows, screenshot=${!!shot.path}, ax=${!!(ax && ax.focused)}, bounds=${shot.bounds || 'unknown'}`,
    channels: {
      visual: !!shot.path,
      semantic: !!(ax && ax.focused),
      programmatic: true,
    },
  };
}

/**
 * 简单状态一致性对比（点击前/后）
 * 检查焦点元素是否变化、截图是否产生
 * 参考：截图陈旧导致点击失效
 */
function compareObservations(before, after) {
  if (!before || !after) return { changed: false, note: 'missing observation' };
  const focusBefore = before.focus && before.focus.Name;
  const focusAfter = after.focus && after.focus.Name;
  const focusChanged = focusBefore !== focusAfter;
  const hasNewShot = !!(after.screenshot && after.screenshot !== before.screenshot);
  return {
    changed: focusChanged || hasNewShot,
    focusChanged,
    hasNewShot,
    beforeFocus: focusBefore || null,
    afterFocus: focusAfter || null,
    note: focusChanged ? 'focus changed' : (hasNewShot ? 'screenshot refreshed' : 'no obvious change'),
  };
}

/**
 * 准备给外部视觉/规划 API 的载荷
 * 不直接调用，供调用方使用（截图路径 + AX 摘要）
 */
function prepareVisionPayload(observation, extra = {}) {
  return {
    ts: observation.ts,
    screenshot: observation.screenshot || null,
    screenshotError: observation.screenshotError || null,
    focus: observation.focus || null,
    accessibilitySummary: observation.accessibility && observation.accessibility.note,
    windowsCount: (observation.windows || []).length,
    channels: observation.channels || {},
    ...extra,
  };
}

module.exports = {
  observe,
  enumerateWindows,
  takeScreenshot,
  compareObservations,
  prepareVisionPayload,
  // 重新导出便于上层直接使用
  findElementsByName,
  getClickableElements,
};
