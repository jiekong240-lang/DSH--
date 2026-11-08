'use strict';
/**
 * FreeCAD tool — quality-first
 *
 * Design principles:
 * - Structured result (never rely on string matching alone)
 * - Geometric validity checks (volume, isValid, solid count)
 * - Explicit failure reasons
 * - Temporary scripts cleaned up on success
 * - Compatible with CUA verification loop
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const FREECAD_CMD = 'C:\\Users\\64562\\AppData\\Local\\Programs\\FreeCAD 1.1\\bin\\freecadcmd.exe';
const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function runFreeCADScript(scriptContent, timeoutMs = 180000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FREECAD_CMD)) {
      return resolve({
        ok: false,
        error: 'freecadcmd_not_found',
        detail: FREECAD_CMD,
      });
    }

    ensureLogDir();
    const scriptPath = path.join(LOG_DIR, `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.py`);

    try {
      fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    } catch (e) {
      return resolve({ ok: false, error: 'script_write_failed', detail: e.message });
    }

    execFile(
      FREECAD_CMD,
      [scriptPath],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = String(stdout || '');
        const errOut = String(stderr || '');

        let metrics = null;
        try {
          const m = out.match(/__METRICS__\s*(\{.*?\})\s*__END__/s);
          if (m) metrics = JSON.parse(m[1]);
        } catch { /* ignore parse error */ }

        const result = {
          ok: !err && metrics && metrics.ok === true,
          error: err ? 'process_error' : (metrics && metrics.ok === false ? metrics.reason : null),
          detail: err ? String(err.message || err).slice(0, 400) : (metrics && metrics.reason),
          metrics,
          stdout: out.trim().slice(0, 2000),
          stderr: errOut.trim().slice(0, 1000),
          scriptPath,
        };

        if (result.ok) {
          try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
        }

        resolve(result);
      }
    );
  });
}

const freecadTool = {
  name: 'freecad',
  description: 'Quality-first FreeCAD parametric CAD (structured validation)',

  async createVerifiedBox({ length = 50, width = 30, height = 20, outPath } = {}) {
    const expected = length * width * height;
    const script = `
import FreeCAD as App
import Part
import json

doc = App.newDocument("hq")
box = doc.addObject("Part::Box", "Box")
box.Length = ${length}
box.Width = ${width}
box.Height = ${height}
doc.recompute()

shape = box.Shape
vol = shape.Volume
valid = shape.isValid()
solids = len(shape.Solids)

ok = valid and solids == 1 and abs(vol - ${expected}) < 0.05
reason = None
if not valid: reason = "shape_invalid"
elif solids != 1: reason = f"solid_count_{solids}"
elif abs(vol - ${expected}) >= 0.05: reason = f"volume_{vol}_expected_${expected}"

${outPath ? `if ok: doc.saveAs(r"${outPath.replace(/\\/g, '\\\\')}")` : ''}

print("__METRICS__")
print(json.dumps({
  "ok": ok,
  "reason": reason,
  "volume": vol,
  "expected": ${expected},
  "valid": valid,
  "solids": solids,
  "faces": len(shape.Faces),
}))
print("__END__")
`;
    return runFreeCADScript(script);
  },

  async exportStep({ fcstdPath, outPath }) {
    if (!fcstdPath || !outPath) {
      return { ok: false, error: 'missing_path' };
    }
    const script = `
import FreeCAD as App
import Part
import json
import os

doc = App.openDocument(r"${fcstdPath.replace(/\\/g, '\\\\')}")
doc.recompute()

candidates = [o for o in doc.Objects if hasattr(o, "Shape") and o.Shape.Solids]
if not candidates:
    print("__METRICS__")
    print(json.dumps({"ok": False, "reason": "no_solid"}))
    print("__END__")
    raise SystemExit(1)

obj = candidates[0]
shape = obj.Shape
vol = shape.Volume
valid = shape.isValid()

ok = valid and vol > 1e-3
reason = None if ok else ("invalid" if not valid else "zero_volume")

if ok:
    shape.exportStep(r"${outPath.replace(/\\/g, '\\\\')}")
    ok = os.path.exists(r"${outPath.replace(/\\/g, '\\\\')}")
    if not ok: reason = "step_not_written"

print("__METRICS__")
print(json.dumps({
  "ok": ok,
  "reason": reason,
  "volume": vol,
  "valid": valid,
  "solids": len(shape.Solids),
  "faces": len(shape.Faces),
}))
print("__END__")
`;
    return runFreeCADScript(script);
  },
};

module.exports = freecadTool;
