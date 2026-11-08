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
  - `action.js`：真实 mouse_event 点击、坐标校验、更好的错误返回 + 可选习惯记录
  - `observer.js`：截图稳定性提升 + **多屏支持（VirtualScreen）** + 状态一致性辅助 + 视觉载荷准备
  - `accessibility.js`：更完整的焦点元素属性 + **按名称搜索元素** + **可点击元素提取** + **BoundingRectangle 解析器**
  - `supervisor.js`：更结构化的失败处理与批准请求 + 审计包含 verification
- **前沿技术资料已入库**：`docs/references/CUA_FRONTIER_REFERENCES.md`
  - OSWorld 2.0、WindowsAgentArena、Agent S3、UI-TARS-2、HCU、OpenCUA 等
  - 按与本仓库模块的映射关系整理
- **本次高质量优化**：
  - index.js：点击后调用 compareObservations 做状态验证，并写入审计
  - index.js + accessibility.js：支持 step.targetName → findElementsByName → parseBoundingRectangle → 自动填充 x/y（减少纯坐标依赖）
  - 新增 cua/brain.js：外部视觉/规划 API 骨架（CUA_VISION_API 环境变量，使用 prepareVisionPayload，未配置时回退本地 decide）
  - supervisor 审计与经验学习载荷包含 verification 信息

### 证据
- Git 提交记录：搜索 `feat(cua):` 前缀
- 代码头部注释含 `CORE - 首要核心，勿删除` 与 TRACE 日期
- `cua/README.md` 已明确标注五大核心模块
- 参考资料：`docs/references/CUA_FRONTIER_REFERENCES.md`
- 新函数已导出，可在上层直接调用

### 当前状态
- 观察：窗口枚举 + **VirtualScreen 多屏截图** + AX 浅层树 + **状态对比** + **视觉载荷准备**
- 动作：真实 mouse_event 点击 + 鼠标移动 + type + 可选习惯记录 + 名称解析坐标
- 可访问性：焦点信息 + **按名称搜索** + **可点击元素提取** + **矩形解析**
- 任务：持久化 + 失败记录/重试判断 + 外部大脑建议接入点
- 监督：审计 + 结构化人工批准请求 + 成功后经验学习触发 + verification 记录
- 闸门：对齐 sentinel，L3 默认拒绝
- 大脑：`cua/brain.js` 骨架就绪（环境变量驱动）
- 参考资料：已就绪

### 下一步（优先级）
1. 把人工批准通道接到监控大屏或通知
2. 丰富 brain.js 的请求/响应协议与错误处理（对齐实际外部视觉 API）
3. 参考 `docs/references/CUA_FRONTIER_REFERENCES.md` 补充具体能力（优先 HCU 三通道协同、Agent S3 层次规划）
4. 为常见动作（click/type）增加更严格的事后验证规则（例如焦点必须变化才算成功）

### 验证方式
- 运行 `node cua/index.js`（Windows 本机）
- 检查 `logs/screenshots/` 是否产生截图（多屏时应覆盖虚拟屏）
- 检查 `state/pending-approvals.json`（L3 动作时）
- 检查 `state/habits.jsonl`（若启用 habits）
- 检查审计日志是否含 verification 字段
- 对照本日志与 `cua/README.md`
- 查看 `docs/references/CUA_FRONTIER_REFERENCES.md`
- 测试 targetName 步骤是否能自动解析坐标
