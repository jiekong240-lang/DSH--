'use strict';
/**
 * FreeCAD 高质量 CAD 工具
 *
 * 使用本地已安装 FreeCAD 1.1.4，通过 freecadcmd 执行 Python 脚本。
 * 不依赖完整源码。
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const FREECAD_CMD = 'C:\\Users\\64562\\AppData\\Local\\Programs\\FreeCAD 1.1\\bin\\freecadcmd.exe';

function runFreeCAD(scriptPath, timeout = 120000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FREECAD_CMD)) {
      return resolve({ ok: false, error: 'freecadcmd not found at configured path' });
    }
    execFile(
      FREECAD_CMD,
      [scriptPath],
      { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          error: err ? String(err.message || err).slice(0, 500) : null,
        });
      }
    );
  });
}

const freecadTool = {
  name: 'freecad',
  description: 'High-quality CAD via local FreeCAD 1.1.4 (freecadcmd)',

  async runScript(scriptPath) {
    if (!scriptPath) return { ok: false, error: 'scriptPath required' };
    return runFreeCAD(scriptPath);
  },

  /** 示例：创建精确盒子并验证体积 */
  async createVerifiedBox(length = 50, width = 30, height = 20, outPath) {
    const script = `
import FreeCAD as App
import Part
doc = App.newDocument("hq")
box = doc.addObject("Part::Box", "Box")
box.Length = ${length}
box.Width = ${width}
box.Height = ${height}
doc.recompute()
vol = box.Shape.Volume
print("VOLUME:", vol)
if abs(vol - ${length * width * height}) > 0.01:
    raise Exception("volume mismatch")
${outPath ? `doc.saveAs(r"${outPath}")` : ''}
print("OK")
`;
    const tmp = path.join(__dirname, '..', 'logs', `fc-box-${Date.now()}.py`);
    try {
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.writeFileSync(tmp, script, 'utf8');
      const r = await runFreeCAD(tmp);
      return { ...r, script: tmp };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  },
};

module.exports = freecadTool;
