# SPEC:digital-twin-monitor

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
