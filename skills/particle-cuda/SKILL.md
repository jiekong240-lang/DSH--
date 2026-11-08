---
name: particle-cuda
description: "JARVIS particle system with CUDA acceleration via CuPy. Use when generating shapes, updating particles, or checking GPU fallback behavior in the DSH-- frontend."
type: workflow
lifecycle: active
---

# Particle CUDA — Acceleration Layer

Particle simulation prefers CUDA (CuPy) and falls back to NumPy. Frontend prefers server-generated points.

## When to use
- Generate tower / sphere point clouds
- Step particle simulation with repulsion
- Check device info and adaptive particle cap
- Debug CUDA vs local fallback in JARVIS UI

## Core workflow
1. Backend: `cuda/particle_sim.py` (CuPy if available, else NumPy).
2. Adaptive cap based on free VRAM (conservative for laptop GPUs).
3. Frontend `public/app.js` calls `/api/cuda/generate`; on failure uses local generation.
4. Status shows "CUDA 就绪" or "本地回退".

## Quality notes
| Item | Behavior |
|------|----------|
| CUDA present | CuPy arrays, .get() for transfer |
| No CUDA | NumPy fallback, same API |
| Large N | Sampled repulsion to avoid N² OOM |
| Cap | Dynamic from free VRAM, hard ~32k |

## Key paths
- Simulation: `cuda/particle_sim.py`
- Requirements: `cuda/requirements.txt`
- Frontend: `public/app.js` (fetchCudaPoints / setShape)
- Endpoints: `/api/cuda/info`, `/api/cuda/generate`, `/api/cuda/step`

## Do not
- Assume CUDA is always available
- Ignore adaptive_cap when increasing particle count
- Modify local GPU drivers or CUDA toolkit from repo changes
