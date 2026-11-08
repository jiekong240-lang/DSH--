---
name: cua-core
description: "CUA main loop and agent-desktop integration. Use when implementing or modifying the observe-decide-act-verify cycle, accessibility tree handling, or routing actions in DSH--."
type: workflow
lifecycle: active
---

# CUA Core — Observe-Decide-Act-Verify

CUA is the primary system. agent-desktop is the preferred precise operation channel.

## When to use
- Extend or debug the main loop in `cua/index.js`
- Add or route actions in `cua/action.js`
- Integrate observation sources (screenshot, AX, agent-desktop snapshot)
- Enforce permission and verification gates

## Core workflow
1. Observe via `observer.js` (screenshot + accessibility + optional agent-desktop snapshot).
2. Decide in `task.js` or optional `brain.js`.
3. Check `gate.js` before any write action.
4. Execute through `action.js` (prefer ad-* for agent-desktop refs).
5. Re-observe and compare; advance or record failure.

## Quality gates
| Requirement | Source |
|-------------|--------|
| Structured observation | observer.js |
| Explicit failure reason | task.js / supervisor.js |
| Prefer semantic ref over raw coordinate | action.js + agent-desktop-tool.js |
| No local machine mutation from repo changes | Project constraint |

## Key paths
- Main: `cua/index.js`, `cua/action.js`, `cua/observer.js`
- Channel: `cua/agent-desktop-tool.js`
- Docs: `docs/CUA_ARCHITECTURE.md`

## Do not
- Bypass gate.js for side effects
- Treat screenshot alone as sufficient when AX/agent-desktop is available
- Modify files outside the repository
