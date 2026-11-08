'use strict';
/**
 * 屏幕与窗口观察
 *
 * CORE - 首要核心，勿删除
 * 混合观察：截图 + 窗口枚举 + 可访问性浅层树 + agent-desktop Accessibility Tree
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAccessibilityTree, findElementsByName, getClickableElements } = require('./accessibility');
const agentDesktop = require('./agent-desktop-tool');

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
 * 混合观察 + agent-desktop 快照
 */
async function observe(options = {}) {
  const includeAx = options.includeAx !== false;
  const appForAd = options.app || options.adApp;

  const [windows, shot, ax, adSnap] = await Promise.all([
    enumerateWindows(),
    takeScreenshot(),
    includeAx ? getAccessibilityTree(options.maxAxChildren || 12) : Promise.resolve(null),
    appForAd ? agentDesktop.snapshot(appForAd).catch(() => null) : Promise.resolve(null),
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
    agentDesktop: adSnap && adSnap.ok ? adSnap.stdout : null,
    focus: ax && ax.focused ? ax.focused : null,
    note: `observer: ${windows.length} windows, screenshot=${!!shot.path}, ax=${!!(ax && ax.focused)}, ad=${!!adSnap}`,
    channels: {
      visual: !!shot.path,
      semantic: !!(ax && ax.focused),
      agentDesktop: !!(adSnap && adSnap.ok),
      programmatic: true,
    },
  };
}

function compareObservations(before, after) {
  if (!before || !after) return { changed: false, note: 'missing observation' };
  const focusBefore = before.focus && before.focus.Name;
  const focusAfter = after.focus && after.focus.Name;
  const focusChanged = focusBefore !== focusAfter;
  const hasNewShot = !!(after.screenshot && after.screenshot !== before.screenshot);
  const adChanged = before.agentDesktop !== after.agentDesktop;
  return {
    changed: focusChanged || hasNewShot || adChanged,
    focusChanged,
    hasNewShot,
    adChanged,
    beforeFocus: focusBefore || null,
    afterFocus: focusAfter || null,
    note: focusChanged ? 'focus changed' : (adChanged ? 'agent-desktop tree changed' : (hasNewShot ? 'screenshot refreshed' : 'no obvious change')),
  };
}

function prepareVisionPayload(observation, extra = {}) {
  return {
    ts: observation.ts,
    screenshot: observation.screenshot || null,
    screenshotError: observation.screenshotError || null,
    focus: observation.focus || null,
    accessibilitySummary: observation.accessibility && observation.accessibility.note,
    agentDesktopSummary: observation.agentDesktop ? observation.agentDesktop.slice(0, 2000) : null,
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
  findElementsByName,
  getClickableElements,
};
