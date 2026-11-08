---
name: jarvis-particles
description: "JARVIS GPU particle system with CUDA acceleration and local fallback. Use when modifying particle shapes, CUDA generation, or the frontend visualization in DSH--."
type: workflow
lifecycle: active
---

# JARVIS Particles — CUDA + Local Fallback

Frontend particle visualization for the JARVIS interface. CUDA preferred, local fallback available.

## When to use
- Adjust particle count, shapes (tower/sphere), or animation parameters
- Modify CUDA generation in `cuda/particle_sim.py`
- Change frontend behavior in `public/app.js`
- Add new shape generators

## Core workflow
1. Shape request from chat reaches `/api/chat` then triggers `setShape()`.
2. `fetchCudaPoints()` calls `POST /api/cuda/generate`.
3. If CUDA succeeds, use returned points; otherwise fall back to `generateTowerLocal` / `generateSphereLocal`.
4. Particles attract to target points with damping; status shows "CUDA 就绪" or "本地回退".

## CUDA status (confirmed in repo)
- `cuda/particle_sim.py` uses CuPy with NumPy fallback (`HAS_CUDA`).
- Adaptive particle cap based on VRAM.
- Frontend prefers CUDA points via `/api/cuda/generate`.
- Local generation exists as pure JS fallback.

## Quality gates
| Check | Required |
|-------|----------|
| CUDA path returns points | yes when available |
| Fallback produces valid Float32Array | yes |
| Status reflects actual path used | yes |
| No local machine mutation from repo | Project constraint |

## Key paths
- Frontend: `public/app.js`, `public/index.html`
- CUDA: `cuda/particle_sim.py`, `cuda/README.md`
- API: server routes under `/api/cuda/*`

## Do not
- Assume CUDA is always present
- Remove local fallback
- Modify files outside the repository
