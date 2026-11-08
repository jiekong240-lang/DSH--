---
name: cua-freecad
description: "High-quality CAD modeling with FreeCAD via CUA. Use when creating, validating, or exporting parametric CAD models, denture bases, or STEP files through the DSH-- CUA pipeline."
type: workflow
lifecycle: active
---

# CUA FreeCAD — High-Quality CAD

Use this skill for parametric, validated CAD work in the DSH-- project. CUA is primary; FreeCAD is the execution target.

## When to use
- Create verified parametric solids
- Export STEP with geometric checks
- Build or adapt denture / oral modeling helpers
- Route FreeCAD actions through `cua/action.js`

## Core workflow
1. Prefer `cua/freecad-tool.js` methods (`createVerifiedBox`, `exportStep`).
2. Require structured result: `ok`, `metrics.volume`, `metrics.valid`, `reason`.
3. Reject results where `valid !== true` or volume deviation > 0.05.
4. For custom geometry, place scripts under `vendors/freecad/templates/` and call via `fc-script`.
5. After export, confirm STEP file existence and solid count in metrics.

## Quality gates
| Check | Required |
|-------|----------|
| `shape.isValid()` | true |
| Solid count | == 1 |
| Volume deviation | < 0.05 mm³ |
| STEP written | file exists |

## Key paths (repo only)
- Tool: `cua/freecad-tool.js`
- Dispatcher: `cua/action.js`
- Templates: `vendors/freecad/templates/`
- Local FreeCAD path is documented, never modified from here

## Do not
- Modify local machine files
- Skip geometric validation
- Treat string "OK" as sufficient proof
