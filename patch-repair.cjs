// patch-repair.cjs — live-code: 红色修复手段(调用 DSH headless 直接调查修复)
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/index.js';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

// ① import path
if (!/import path from 'node:path';/.test(s)) {
  s = s.replace("import fs from 'node:fs';", "import fs from 'node:fs';\nimport path from 'node:path';");
  n++; console.log('import path: added');
}

// ② RepairRuns 类(插在 Engine import 之后)
if (!s.includes('class RepairRuns')) {
  const anchor = "import { Engine } from './engine.mjs?types=2';";
  const cls = anchor + `

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const DSH_BIN = path.resolve(PLUGIN_DIR, '../../node_modules/@deepseek-ai/dsh/lib/bin.js');
/** 红色修复手段: 调用 DSH headless 直接调查并修复真实失败的文件(修复会话本身也在大屏可见) */
class RepairRuns {
  constructor(engine) {
    this.engine = engine;
    this.runs = new Map();
    this.children = new Map();
  }
  start(id) {
    const f = this.engine.files.get(id);
    if (!f) throw Error('unknown file');
    if (f.status !== 'failed') throw Error('红线: 只有真实检查失败(failed)的文件才需要修复');
    if (this.children.has(id)) throw Error('该文件已有修复在运行');
    if (this.children.size >= 2) throw Error('已有 2 个修复在运行, 请稍候');
    const rel = f.rel;
    const root = this.engine.roots[f.r];
    const err = String(f.message).slice(0, 600);
    const run = { id: 'repair:' + id, file: id, rel, status: 'running', startedAt: Date.now(), output: '', error: err };
    this.runs.set(id, run);
    const task = '修复文件 ' + rel + ' 的语法错误, 使其通过 node --check。真实诊断证据(node --check 原文):\\n' + err + '\\n\\n要求: 只修这一个文件的语法, 不改业务逻辑, 不改其他文件; 修完运行 node --check ' + rel + ' 自验; 完成后一句话说明改了什么。';
    const child = spawn(process.execPath, [DSH_BIN, '--profile', 'headless', task], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.set(id, child);
    let out = '';
    let ended = false;
    const finish = (status) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      run.status = status;
      run.finishedAt = Date.now();
      run.output = out.slice(-4000);
      this.children.delete(id);
      try { this.engine.refresh(f.r, f.rel, true); } catch { }
    };
    const timer = setTimeout(() => { try { child.kill(); } catch { } }, 300000);
    child.stdout.on('data', (b) => { out = (out + b).slice(-8000); this.engine.seq++; });
    child.stderr.on('data', () => { });
    child.on('error', (e) => { run.output += String(e); finish('failed'); });
    child.on('close', (code) => finish(code === 0 ? 'passed' : 'failed'));
    return { ...run };
  }
  snapshot() { return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt); }
}`;
  const at = s.indexOf(anchor);
  s = s.slice(0, at) + cls + s.slice(at + anchor.length);
  n++; console.log('RepairRuns: inserted');
}

// ③ 实例化(在 inject 回调里, engine/tests 之后)
if (!s.includes('const repairs=new RepairRuns(engine)')) {
  s = s.replace('const tests=new TestRuns(engine);', 'const tests=new TestRuns(engine);const repairs=new RepairRuns(engine);');
  n++; console.log('repairs: instantiated');
}

// ④ /repair 路由(浏览器调用: cookie 鉴权 + X-DSH-Live 头, 与 run-test 同栅栏)
if (!s.includes("base+'/repair'")) {
  const anchor2 = "else if(u.pathname===base+'/recheck'&&req.method==='POST'&&req.headers['x-dsh-live']==='1')";
  const route = anchor2 + "\n else if(u.pathname===base+'/repair'&&req.method==='POST'&&req.headers['x-dsh-live']==='1')result=repairs.start(u.searchParams.get('id'));";
  s = s.replace(anchor2, route);
  n++; console.log('route: added');
}

// ⑤ /state 两处附 repairs 快照
s = s.replace(/testFiles:engine\.roots\.map\(\(_,r\)=>tests\.list\(r\)\)\}/g, 'testFiles:engine.roots.map((_,r)=>tests.list(r)),repairs:repairs.snapshot()}');
n++; console.log('state: repairs snapshot wired');

fs.writeFileSync(f, s);
console.log('done, changes:', n);
console.log('verify:', /class RepairRuns/.test(s), /const repairs=new RepairRuns\(engine\)/.test(s), /base\+'\/repair'/.test(s), s.includes('repairs:repairs.snapshot()'));
