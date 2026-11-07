# CUA 进展日志（可追溯）

每次改动都在此记录：做了什么、改了哪里、证据是什么、下一步是什么。

## 2026-11-08

### 已完成
- 建立 `cua/` 目录与最小闭环骨架
- **supervisor 已支持本地审计日志写入**（`logs/cua-audit.jsonl`）
- **观察模块接入真实窗口枚举**（PowerShell）
- **闸门对齐 sentinel/gate.cjs**
- **任务契约持久化**（`state/cua-task.json`）
- **动作模块接入基础真实输入**
- **CORE（首要核心，勿删除）已落地**：
  - 屏幕截图（`observer.js` takeScreenshot，保存到 logs/screenshots/）
  - 精确鼠标/键盘控制骨架（SendInput 级别，`action.js` mouseMove/click）
  - 可访问性树 / UI 元素定位骨架（`accessibility.js`）
  - 任务多步规划与失败恢复（`task.js` recordFailure / shouldRetry）
  - Supervisor / Guardian 闭环与人工批准通道（`supervisor.js` requestHumanApproval → state/pending-approvals.json）
- **质量升级**：
  - `action.js`：真实 mouse_event 点击、坐标校验、更好的错误返回
  - `observer.js`：截图稳定性提升（文件存在检查 + 错误信息）
  - `accessibility.js`：更完整的焦点元素属性（ClassName、BoundingRectangle 等）
  - `supervisor.js`：更结构化的失败处理与批准请求
- **前沿技术资料已入库**：`docs/references/CUA_FRONTIER_REFERENCES.md`
  - OSWorld、WindowsAgentArena、GUI Agents Survey、ACU Survey、Agent S2、OpenCUA、HCU、Mage-VL-Cowork 等
  - 按与本仓库模块的映射关系整理，供下次开发直接使用

### 证据
- Git 提交记录：搜索 `refactor(cua):` 与 `feat(cua):` 前缀
- 代码头部注释含 `CORE - 首要核心，勿删除`
- `cua/README.md` 已明确标注五大核心模块
- 参考资料：`docs/references/CUA_FRONTIER_REFERENCES.md`

### 当前状态
- 观察：窗口枚举 + 更稳定截图（视觉理解走 API）
- 动作：真实 mouse_event 点击 + 鼠标移动 + type
- 可访问性：更完整的焦点元素信息
- 任务：持久化 + 失败记录/重试判断
- 监督：审计 + 结构化人工批准请求
- 闸门：对齐 sentinel，L3 默认拒绝
- 参考资料：已就绪，可直接用于下次能力补充

### 下一步（优先级）
1. 完善截图多屏支持
2. 把 accessibility 接入真实 UI Automation 树遍历
3. 把人工批准通道接到监控大屏或通知
4. API 调用骨架（观察结果 → 外部视觉/规划 → 动作）
5. 参考 `docs/references/CUA_FRONTIER_REFERENCES.md` 补充具体能力

### 验证方式
- 运行 `node cua/index.js`
- 检查 `logs/screenshots/` 是否产生截图
- 检查 `state/pending-approvals.json`（L3 动作时）
- 对照本日志与 `cua/README.md`
- 查看 `docs/references/CUA_FRONTIER_REFERENCES.md`
