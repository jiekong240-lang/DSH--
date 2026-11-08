# CUA 运行与计算依赖

仅仓库标记，本地按需安装。不修改本地。

## 核心（已内置 / 零依赖优先）
- Node.js（原生）
- Windows PowerShell + user32 SendInput（鼠标键盘回退）
- 本地可访问性（accessibility.js）

## agent-desktop（精准通道）
- 官方：https://github.com/vercel-labs/agent-desktop
- 安装：`npm install -g agent-desktop` 或按 vendors/agent-desktop/setup.sh
- 用途：Accessibility Tree + @ref 稳定引用

## FreeCAD（CAD 执行目标）
- 本地已安装 1.1.4（路径见 vendors/freecad/README.md）
- 可选验证：gnucleus-freecad-validator（见 vendors/freecad/dependencies.md）
- 可选高层：build123d

## 前端（贾维斯）
- Three.js（已在 public/lib/）
- 可选 CUDA 粒子：cuda/particle_sim.py

## 原则
- 优先使用仓库内已接入的通道
- 外部依赖均为可选，不强制安装
- 所有变更只提交到仓库
