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
  supervisor.js       # 监督循环
  gate.js             # 权限闸门（对齐 sentinel）
docs/
  CUA_ARCHITECTURE.md # 详细架构与约束
sentinel/             # 现有哨兵（支持）
server.js             # 监控服务（支持）
public/               # 大屏前端（支持）
```

## 下一步（优先级）

1. 在 `cua/` 实现最小可行闭环（观察 → 决策 → 执行 → 验证 → 回写）
2. 把屏幕操作与现有哨兵闸门对接
3. 建立任务契约与失败恢复机制
4. 监控大屏降级为运维工具

详见 `docs/CUA_ARCHITECTURE.md` 和 `cua/README.md`。

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
    response_200: '{events:[{seq,ts,source,kind,tool,target,status}], counts}'
    response_400: "from/to present but not numeric"
    known_defect: "server.js:321 ts:Number(b.ts)||Date.now() — caller ts===0 replaced by now; task spec requires preserving ts===0"
  "POST /api/event":
    body: "{kind,tool,target,status,source?,ts?,file?}"
    behavior: "ts preserved if numeric-nonzero; file NOT stored (pre-existing shape — do not assume round-trip); kind=code registers file via target+cwd into fileRegistry"
    response_200: '{ok:true,...}'
  "GET /api/files": "{files:[{file,lastTs,...}]}"

frontend_contract:
  entry: "public/index.html loads public/app.js"
  filter_flow: "inputs #filterFrom/#filterTo → GET /api/events?from&to → render into #feedList"
  known_defect: "app.js:951 list.innerActivity.list — innerActivity undefined; TypeError on every successful query; swallowed by .catch(); user keeps stale list. FIX = remove/replace that assignment before innerHTML render. NOT YET FIXED."

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
  - "fix app.js:951 (user-visible filter rendering)"
  - "preserve ts===0 in POST /api/event"
  - "test: no orphan listener on 3999 after failure paths"
```
