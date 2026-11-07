'use strict';
/**
 * 屏幕与窗口观察
 * 
 * CORE - 首要核心，勿删除
 * 屏幕截图 + 视觉理解接口（截图本地完成，视觉理解走 API）
 * 
 * TRACE 2026-11-08: 增加截图能力（PowerShell / .NET）
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function runPowerShell(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 15000, windowsHide: true },
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

/**
 * CORE: 截图
 * 保存到 logs/screenshots/ 并返回路径（供 API 视觉理解使用）
 */
async function takeScreenshot() {
  const dir = path.join(__dirname, '..', 'logs', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `screen-${Date.now()}.png`);
  const cmd = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bmp.Save('${file.replace(/\\/g, '\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output '${file.replace(/\\/g, '\\')}'
  `;
  const out = await runPowerShell(cmd);
  return out.trim() || null;
}

async function observe() {
  const windows = await enumerateWindows();
  const screenshot = await takeScreenshot();
  return {
    ts: Date.now(),
    screenshot, // 本地文件路径，可送 API 做视觉理解
    windows: windows.map((w) => ({
      process: w.ProcessName,
      pid: w.Id,
      title: w.MainWindowTitle,
    })),
    focus: null,
    note: `observer: ${windows.length} windows, screenshot=${!!screenshot}`,
  };
}

module.exports = { observe, enumerateWindows, takeScreenshot };
