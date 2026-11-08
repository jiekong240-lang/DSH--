# FreeCAD

## 本地安装（已核对）
- 版本：FreeCAD 1.1.4 (Revision: 20260928)
- 安装根目录：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1`
- CLI：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1\bin\freecadcmd.exe`
- GUI：`C:\Users\64562\AppData\Local\Programs\FreeCAD 1.1\bin\freecad.exe`
- 注：不在系统 PATH 中，调用时使用完整路径

## 高质量 CAD 工作流
不拉完整源码。使用本地已安装版本 + Python API / freecadcmd 做精确建模。

### 推荐方式
1. **无头脚本**：freecadcmd + Part / PartDesign / Sketcher
2. **精度控制**：单位统一为 mm，公差明确，重新计算后验证体积/面积
3. **CUA 协作**：agent-desktop 操作 GUI 细节，脚本负责批量精确建模
4. **输出**：STEP / STL / FCStd，带验证报告

## 作为 CUA 执行目标
见 `cua/freecad-tool.js`。
