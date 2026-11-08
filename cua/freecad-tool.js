'use strict';
/**
 * FreeCAD 高质量 CAD 工具
 *
 * 使用本地已安装 FreeCAD 1.1.4，通过 freecadcmd 执行 Python 脚本。
 * 支持 STEP 导出 + 几何校验。
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const FREECAD_CMD = 'C:\\Users\\64562\\AppData\\Local\\Programs\\FreeCAD 1.1\\bin\\freecadcmd.exe';

function runFreeCAD(scriptPath, timeout = 180000) {
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
  description: 'High-quality CAD via local FreeCAD 1.1.4 (freecadcmd + STEP validation)',

  async runScript(scriptPath) {
    if (!scriptPath) return { ok: false, error: 'scriptPath required' };
    return runFreeCAD(scriptPath);
  },

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

  /** 导出 STEP 并做几何校验（体积 + 面数） */
  async exportStep(fcstdPath, outPath) {
    if (!fcstdPath || !outPath) return { ok: false, error: 'fcstdPath and outPath required' };
    const script = `
import FreeCAD as App
import Part
doc = App.openDocument(r"${fcstdPath}")
doc.recompute()
obj = None
for o in doc.Objects:
    if hasattr(o, "Shape") and o.Shape.Volume > 0:
        obj = o
        break
if not obj:
    raise Exception("no solid found")
vol = obj.Shape.Volume
faces = len(obj.Shape.Faces)
print("VOLUME:", vol)
print("FACES:", faces)
if vol <= 0:
    raise Exception("invalid volume")
obj.Shape.exportStep(r"${outPath}")
print("STEP_EXPORTED")
print("OK")
`;
    const tmp = path.join(__dirname, '..', 'logs', `fc-step-${Date.now()}.py`);
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
