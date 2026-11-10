# Windows CUA — 核心目标与当前位置

> 这个仓库的核心目标是**构建可在 Windows 桌面上真实操作的 Computer Use Agent (CUA)**，
> 而不是监控大屏本身。
>
> 监控、哨兵、事件流、账本、闸门是支持基础设施，不是终极交付物。

## 一句话目标

在 Windows 上做出一个**可信、可审计、有权限边界、能持续自我校正**的桌面操作智能体：

- 能看屏幕、移鼠标、键盘输入、窗口管理、进程控制
- 能按任务契约执行多步操作，失败可恢复、状态可追踪
- 能在监督循环（Supervisor / Guardian）下运行，高风险动作必须人工批准
- 能和现有的 DSH / 多智能体协作，但核心是“自己能操作电脑”

## 当前仓库的真实位置

**CUA 本体正在 `cua/` 目录中构建。**

现有内容仍为支持设施：

- 数字孪生监控大屏（server.js + Three.js 前端）— 降级为运维工具
- 哨兵（sentinel/）：感知 → 大脑 → 闸门 → 记录/有限执行 — 可复用其闸门思路
- CUA 瞭望哨（cua-lookout.cjs）：红绿判定 + 可选截图佐证
- 大量诊断、修补、验证脚本

## CUA 本体核心思路（必须坚持）

1. **真实操作，不是建议**
   - 能发出真实的鼠标移动、点击、键盘输入、窗口操作
   - 每一步都有可验证的观察结果（截图 / 可访问性树 / 状态差异）

2. **任务契约 + 状态机**
   - 任务有明确的入口、退出条件、失败处理
   - 状态可序列化，可从中断恢复，不靠记忆

3. **监督循环（Supervisor / Guardian）**
   - 执行代理和监督代理分离
   - 高风险动作（写文件、删除、网络、系统设置）必须过闸门，默认拒绝
   - 审计日志完整留存

4. **权限分层（与现有哨兵闸门对齐）**
   - L0 只读
   - L1 提醒
   - L2 白名单可逆写
   - L3 必须人工一次性批准

5. **证据优先于自称成功**
   - 不假绿、不否定失败记录
   - 每个关键路径都有可重复的验证方式

## 目录结构（系统性调整后）

```
cua/                  # CUA 本体（主线）
  index.js            # 入口：观察→决策→执行→验证闭环
  observer.js         # 屏幕观察（截图 / 状态）
  action.js           # 鼠标键盘 / 窗口动作
  task.js             # 任务契约与状态机
  supervisor.js       # 监督循环（含审计日志）
  gate.js             # 权限闸门（对齐 sentinel）
docs/
  CUA_ARCHITECTURE.md # 详细架构与约束
  CUA_PROGRESS.md     # 进展日志（可追溯）
sentinel/             # 现有哨兵（支持）
server.js             # 监控服务（支持）
public/               # 大屏前端（支持）
logs/                 # 运行时审计（cua-audit.jsonl）
```

## 验证与追溯

- 运行：`node cua/index.js`
- 查看审计：`logs/cua-audit.jsonl`
- 对照进展：`docs/CUA_PROGRESS.md`
- 架构说明：`docs/CUA_ARCHITECTURE.md`

## 当前实现与下一步（以 PR #3 为准）

- 当前改造位于独立分支 `feat/cua-verified-coding-loop-20261110`，还未合并 `main`。
- 已有 `cua/code-task.js`：DeepSeek API 自主小步修复→真实测试；`cua/mcp-server.js`：MCP stdio 工具调用入口。
- 已加入写前 checkpoint、读后验证、错误可追踪恢复；不将驱动 `ok` 或截图文件名变化视为目标完成。
- 待真实验收：Windows 桌面 UIA 操作，正式 DSH MCP 注册，真实 DeepSeek API，FreeCAD 保存并独立重开，多文件产品级编码。

请先核对 `docs/CUA_UNFINISHED_AUDIT_2026-11-10.md` 的已完成/待实测清单，再安排真机任务。

详见 `docs/CUA_ARCHITECTURE.md`、`docs/CUA_PROGRESS.md` 和 `cua/README.md`。

---

## 附：原监控服务 SPEC（供运维参考）

```yaml
project:
  identity: local-monitoring-dashboard
  runtime: node>=18 zero-dependency
  entry: server.js
  port: "process.env.PORT || 3210 (production); tests MUST use 3999"
  frontend: "public/ (three.module.js r160 local, no CDN)"

api_contract:
  "GET /api/events":
    query: "from?:epoch-ms, to?:epoch-ms (both optional)"
    behavior: "filter eventBuf by ts in [from,to]; no params = full"
    response_200: '{events:[{seq,ts,source,kind,tool,target,status}], counts, filteredCounts}'
    response_400: "from/to present but not numeric"
    status: "历史 ts=0 缺陷：当前主处理器已正确保留 0；本轮进一步修正哨兵通道和非法值校验"
  "POST /api/event":
    body: "{kind,tool,target,status,source?,ts?,file?}"
    behavior: "ts=0 retained; invalid nonfinite ts returns 400; kind=code registers target in fileRegistry; do not assume request file attribute round-trips"
    response_200: '{ok:true,...}'
  "GET /api/files": "{files:[{file,lastTs,...}]}"

frontend_contract:
  entry: "public/index.html loads public/app.js"
  filter_flow: "inputs #filterFrom/#filterTo → GET /api/events?from&to → render into #feedList"
  status: "历史 innerActivity 语句在本轮读取的实际源码中已不存在；本轮补筛选 0 值、过期响应、计数同步的真实函数回归测试"

architecture:
  server_js: "http server + eventBuf(in-memory) + fileRegistry(persisted state/file-registry.json) + static public/"
  sentinel_dir: "autonomous watcher (config/brain/gate/memory/perception/audit); state in sentinel/state/"
  keeper_scripts: "ladder-daily.cjs quota-probe.cjs cua-lookout.cjs e2e-verify.cjs (ops tooling, not runtime)"

invariants:
  - "never listen on 3210 in tests (production instance owns it); tests use PORT=3999"
  - "never write state/ or monitor-records/ from tests"
  - "zero npm dependencies — do not add package.json deps"
  - "public/lib is vendored three.js — do not edit"

verification_protocol:
  api: "node test-events-filter.cjs (spawns PORT=3999, asserts range/400/full)"
  external: "dsh-sandbox testkit/verify/events-filter.cjs (isolated copy + ts-based assertions + non-target diff)"

forbidden:
  - "committing credentials or .env"
  - "editing state/ monitor-records/ logs/ from agents"
  - "assuming file field round-trips through POST /api/event"

pending_tasks:
  - "真实浏览器页面点击筛选与 WebGL 整体画面验收"
  - "用户 Windows 实机桌面 UIA 与真实 DeepSeek API 验收"
  - "正式 DSH MCP 注册与产品交付独立重开"
```
