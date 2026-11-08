# FreeCAD

## 本地安装（已核对）
- 版本：FreeCAD 1.1.4 (Revision: 20260928)
- 安装根目录：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1`
- CLI：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1\bin\freecadcmd.exe`
- GUI：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1\bin\freecad.exe`
- 注：不在系统 PATH 中，调用时使用完整路径

## 源码
- 上游：https://github.com/FreeCAD/FreeCAD.git
- 本仓库以 submodule 引用，路径：`vendors/freecad/src`

## 作为 CUA 执行目标
可通过 agent-desktop 操作 GUI，或直接调用 freecadcmd 执行 Python 脚本。
