'use strict';
/**
 * FreeCAD high-quality CAD tool (thickened)
 *
 * Local FreeCAD 1.1.4 via freecadcmd.
 * Provides parametric creation, Sketcher/PartDesign helpers,
 * STEP export with geometric validation, and denture-oriented utilities.
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const FREECAD_CMD = 'C:\\Users\\64562\\AppData\\Local\\Programs\\FreeCAD 1.1\\bin\\freecadcmd.exe';
const LOG_DIR = path.join(__dirname, '..', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function runFreeCAD(scriptContent, timeout = 180000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FREECAD_CMD)) {
      return resolve({ ok: false, error: 'freecadcmd not found', path: FREECAD_CMD });
    }
    ensureLogDir();
    const tmp = path.join(LOG_DIR, `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.py`);
    try {
      fs.writeFileSync(tmp, scriptContent, 'utf8');
    } catch (e) {
      return resolve({ ok: false, error: 'write script failed: ' + e.message });
    }

    execFile(
      FREECAD_CMD,
      [tmp],
      { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = String(stdout || '').trim();
        const errOut = String(stderr || '').trim();
        resolve({
          ok: !err && !out.includes('Exception') && !out.includes('Error'),
          stdout: out,
          stderr: errOut,
          error: err ? String(err.message || err).slice(0, 600) : null,
          script: tmp,
        });
      }
    );
  });
}

function parseMetrics(stdout) {
  const vol = (stdout.match(/VOLUME:\s*([\d.eE+-]+)/) || [])[1];
  const faces = (stdout.match(/FACES:\s*(\d+)/) || [])[1];
  const ok = stdout.includes('OK');
  return {
    volume: vol ? Number(vol) : null,
    faces: faces ? Number(faces) : null,
    okFlag: ok,
  };
}

const freecadTool = {
  name: 'freecad',
  description: 'High-quality parametric CAD via local FreeCAD 1.1.4',

  async runScript(scriptPathOrContent) {
    if (!scriptPathOrContent) return { ok: false, error: 'script required' };
    let content = scriptPathOrContent;
    if (fs.existsSync(scriptPathOrContent)) {
      content = fs.readFileSync(scriptPathOrContent, 'utf8');
    }
    const r = await runFreeCAD(content);
    return { ...r, metrics: parseMetrics(r.stdout) };
  },

  async createVerifiedBox(length = 50, width = 30, height = 20, outPath) {
    const expected = length * width * height;
    const script = `
import FreeCAD as App
import Part
doc = App.newDocument("hq_box")
box = doc.addObject("Part::Box", "Box")
box.Length = float(${length})
box.Width = float(${width})
box.Height = float(${height})
doc.recompute()
vol = box.Shape.Volume
faces = len(box.Shape.Faces)
print("VOLUME:", vol)
print("FACES:", faces)
if abs(vol - ${expected}) > 0.05:
    raise Exception(f"volume mismatch: got {vol}, expected ${expected}")
${outPath ? `doc.saveAs(r"${outPath.replace(/\\/g, '\\\\')}")` : ''}
print("OK")
`;
    const r = await runFreeCAD(script);
    return { ...r, metrics: parseMetrics(r.stdout), expectedVolume: expected };
  },

  async exportStep(fcstdPath, outPath) {
    if (!fcstdPath || !outPath) return { ok: false, error: 'fcstdPath and outPath required' };
    const script = `
import FreeCAD as App
import Part
import os
doc = App.openDocument(r"${fcstdPath.replace(/\\/g, '\\\\')}")
doc.recompute()
solids = [o for o in doc.Objects if hasattr(o, "Shape") and o.Shape.Solids]
if not solids:
    raise Exception("no solid objects found")
obj = solids[0]
shape = obj.Shape
vol = shape.Volume
faces = len(shape.Faces)
edges = len(shape.Edges)
print("VOLUME:", vol)
print("FACES:", faces)
print("EDGES:", edges)
if vol <= 1e-6:
    raise Exception("invalid or zero volume")
if not shape.isValid():
    raise Exception("shape is not valid")
shape.exportStep(r"${outPath.replace(/\\/g, '\\\\')}")
if not os.path.exists(r"${outPath.replace(/\\/g, '\\\\')}"):
    raise Exception("STEP file not written")
print("STEP_EXPORTED")
print("OK")
`;
    const r = await runFreeCAD(script);
    return { ...r, metrics: parseMetrics(r.stdout) };
  },

  async createDentureBase(params = {}) {
    const length = params.length || 60;
    const width = params.width || 40;
    const thickness = params.thickness || 3.0;
    const outPath = params.outPath;
    const script = `
import FreeCAD as App
import Part
doc = App.newDocument("DentureBase")
outer = doc.addObject("Part::Box", "Outer")
outer.Length = ${length}
outer.Width = ${width}
outer.Height = ${thickness}
inner = doc.addObject("Part::Box", "Inner")
inner.Length = ${length - 16}
inner.Width = ${width - 20}
inner.Height = ${thickness + 2}
inner.Placement.Base = App.Vector(8, 10, -1)
cut = doc.addObject("Part::Cut", "DentureBase")
cut.Base = outer
cut.Tool = inner
doc.recompute()
vol = cut.Shape.Volume
print("VOLUME:", vol)
if vol <= 0:
    raise Exception("denture base volume invalid")
${outPath ? `doc.saveAs(r"${outPath.replace(/\\/g, '\\\\')}")` : ''}
print("OK")
`;
    const r = await runFreeCAD(script);
    return { ...r, metrics: parseMetrics(r.stdout) };
  },
};

module.exports = freecadTool;
