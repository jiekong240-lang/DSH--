# 外部高质量 SKILL 与工作流

仅作仓库引用标记，不修改本地。

## agent-desktop（官方）
- 仓库：https://github.com/vercel-labs/agent-desktop
- SKILL：https://github.com/vercel-labs/agent-desktop/blob/main/skills/agent-desktop/SKILL.md
- 安装：`npx skills add https://github.com/vercel-labs/agent-desktop --skill agent-desktop`
- 说明：Accessibility Tree 操作闭环（snapshot → click/type → verify），已与本项目 CUA 主流程对齐

## FreeCAD Scripts（awesome-copilot）
- 仓库：https://github.com/github/awesome-copilot
- SKILL：https://github.com/github/awesome-copilot/blob/main/skills/freecad-scripts/SKILL.md
- 安装：`npx skills add https://github.com/github/awesome-copilot --skill freecad-scripts`
- 说明：生产级 FreeCAD Python 脚本生成（Part / Sketcher / FeaturePython / 导出）

## freecad-skill（ninja7v）
- 仓库：https://github.com/ninja7v/freecad-skill
- 说明：参数化建模 + 每步几何验证 + 结构化反馈，与本项目质量门控一致

## 使用建议
1. CUA 操作层优先参考 agent-desktop 官方 SKILL 的 observe-act-verify 闭环
2. FreeCAD 建模优先参考 freecad-scripts 与 ninja7v/freecad-skill 的验证模式
3. 引入时保持仓库只读引用，不把完整外部仓库源码直接提交
