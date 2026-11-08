# FreeCAD 高质量依赖（运行与计算）

仅仓库标记，供本地按需安装。不修改本地环境。

## 1. gnucleus-freecad-validator（几何验证）
- 仓库：https://github.com/gNucleus-AI/freecad-validator
- 安装：`pip install gnucleus-freecad-validator`
- 用途：确定性几何相似度 + 规格一致性打分（体积、表面积、bbox、固体数）
- 与本项目关系：可作为 `freecad-tool.js` 导出后的二次验证层

## 2. build123d（参数化建模）
- 文档：https://build123d.readthedocs.io
- 安装：`pip install build123d`
- 用途：高层级参数化建模，可转换为 FreeCAD Part 对象
- 参考工作台：https://github.com/jopdorp/build123d-freecad

## 3. FreeCAD-DesignProof（参数鲁棒性）
- 仓库：https://github.com/Unai-Pz-de-A/FreeCAD-DesignProof
- 用途：系统变化参数并检查模型是否能稳定重生，识别脆弱特征

## 集成建议（仓库侧）
- 主建模仍走 FreeCAD Python API / freecadcmd
- 验证层可选调用 gnucleus-freecad-validator
- 高层级参数化可选用 build123d 生成后转换
- 所有依赖均为可选，不强制安装
