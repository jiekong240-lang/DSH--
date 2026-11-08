'use strict';
/**
 * 屏幕与窗口观察
 * 
 * CORE - 首要核心，勿删除
 * 屏幕截图 + 视觉理解接口（截图本地完成，视觉理解走 API）
 * 混合观察：截图 + 窗口枚举 + 可访问性浅层树
 * 
 * TRACE 2026-11-08: 接入 accessibility 浅层树，形成 HCU 风格混合观察
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAccessibilityTree } = require('./accessibility');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
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
      $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
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
    return { path: r.stdout, error: null };
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
    windows: windows.map((w) => ({
      process: w.ProcessName,
      pid: w.Id,
      title: w.MainWindowTitle,
    })),
    accessibility: ax,
    focus: ax && ax.focused ? ax.focused : null,
    note: `observer: ${windows.length} windows, screenshot=${!!shot.path}, ax=${!!(ax && ax.focused)}`,
    channels: {
      visual: !!shot.path,
      semantic: !!(ax && ax.focused),
      programmatic: true,
    },
  };
}

module.exports = { observe, enumerateWindows, takeScreenshot };
