#!/usr/bin/env node
// stage1-run.cjs — 一阶段实战发车器 v2(§二修正版)
// 退出语义(修正:不再把 DSH 失败伪装成 0):
//   0 = DSH 正常完成(exit 0 且未被超时杀)  2 = DSH 自身失败(exit≠0)
//   3 = 超时强杀                            4 = 运行器自身错误(spawn 失败等)
// 子进程真实退出码(childExitCode)与原始输出(stdout.raw/stderr.log)一律保留。
// 可注入项(供验收器自检的已知成败样本,不影响生产):STAGE1_DSH_BIN / STAGE1_LIMIT_MS / STAGE1_PROJECT
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SANDBOX = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const DSH_HOME = path.join(SANDBOX, 'dsh-home');
const DSH_BIN = process.env.STAGE1_DSH_BIN || path.join(SANDBOX, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const GIT_BASH = 'C:/Users/64562/.workbuddy/binaries/PortableGit/versions/1.3.0/usr/bin';
const PROJECT = process.env.STAGE1_PROJECT || 'C:/Users/64562/dsh-stage1';
const OUT = path.join(__dirname, 'monitor-records', 'stage1-' + new Date().toISOString().replace(/[:.]/g, '-'));
const LIMIT_MS = Number(process.env.STAGE1_LIMIT_MS || 480000);

const PROMPT = '给这个 todo CLI 添加 done 命令:node cli.js done <id> 把对应任务标记为完成并持久化到 tasks.json,list 用 [x]/[ ] 显示完成状态;id 不存在时输出错误信息并以退出码 1 结束;补充单元测试并保持 npm test 全绿;更新 README 的用法说明。';

let exitCode = 4; // 运行器错误为默认兜底
process.on('exit', () => process.exitCode = exitCode);
process.on('uncaughtException', (e) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'runner-error.txt'), String(e && e.stack || e));
  console.error('runner error: ' + String(e && e.message || e));
  process.exit(4);
});

fs.mkdirSync(OUT, { recursive: true });

function snapshot(dir) {
  const out = {};
  (function walk(d, rel) {
    let entries; try { entries = fs.readdirSync(d); } catch { return; }
    for (const f of entries) {
      if (f === 'node_modules' || f === 'tasks.json') continue;
      const p = path.join(d, f);
      const r = rel ? rel + '/' + f : f;
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, r);
      else out[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
    }
  })(dir, '');
  return out;
}

const before = snapshot(PROJECT);
fs.writeFileSync(path.join(OUT, 'state-before.json'), JSON.stringify({ prompt: PROMPT, startedAt: new Date().toISOString(), dshBin: DSH_BIN, project: PROJECT, before }, null, 2));
console.log('stage1: 快照 ' + Object.keys(before).length + ' 文件;DSH_BIN=' + DSH_BIN + ';限時 ' + Math.round(LIMIT_MS / 1000) + 's');

let child;
try {
  child = spawn(process.execPath, [DSH_BIN, 'headless', '--json', PROMPT], {
    cwd: PROJECT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DSH_HOME, PATH: GIT_BASH + ';' + (process.env.PATH || '') },
  });
} catch (e) {
  fs.writeFileSync(path.join(OUT, 'runner-error.txt'), String(e && e.stack || e));
  console.error('spawn failed: ' + e.message);
  process.exit(4);
}
child.on('error', (e) => {
  fs.writeFileSync(path.join(OUT, 'runner-error.txt'), String(e && e.stack || e));
  console.error('spawn error: ' + e.message);
  process.exit(4);
});

const t0 = Date.now();
let killed = false;
const timer = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch {} }, LIMIT_MS);
let out = '', err = '';
const rawFd = fs.openSync(path.join(OUT, 'stdout.raw'), 'a');
child.stdout.on('data', (d) => { const s = d.toString('utf8'); out += s; fs.writeSync(rawFd, s); });
child.stderr.on('data', (d) => { err += d.toString('utf8'); process.stderr.write('[dsh] ' + d.toString('utf8').slice(0, 200)); });

child.on('close', (code, signal) => {
  clearTimeout(timer);
  fs.closeSync(rawFd);
  const ms = Date.now() - t0;
  fs.writeFileSync(path.join(OUT, 'stderr.log'), err);
  const events = [];
  for (const line of out.split('\n')) {
    const s = line.trim();
    if (s.startsWith('{')) { try { events.push(JSON.parse(s)); } catch {} }
  }
  fs.writeFileSync(path.join(OUT, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'));
  const calls = events.filter((e) => e.type === 'tool_call').map((e) => ({ tool: e.tool, input: JSON.stringify(e.input || {}).slice(0, 200) }));
  const results = events.filter((e) => e.type === 'tool_result').map((e) => JSON.stringify(e).slice(0, 300));
  const finalText = out.split('\n').filter((l) => !l.trim().startsWith('{')).join('\n').trim();
  const sessionId = (events.find((e) => e.sessionId) || {}).sessionId || null;
  const result = {
    prompt: PROMPT, startedAt: new Date(t0).toISOString(), ms, killed, signal: signal || null,
    childExitCode: code, sessionId,
    toolCallCount: calls.length, toolResultCount: results.length, calls,
    finalText: finalText.slice(-4000),
  };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`\nstage1: exit(code=${code},signal=${signal}) killed=${killed} ms=${ms} 工具调用=${calls.length} 结果回传=${results.length} 会话=${sessionId}`);
  console.log('产物目录: ' + OUT);

  // 修正后的退出语义:调用方据此区分四种状态
  if (killed) exitCode = 3;                    // 超时强杀
  else if (code === 0 && calls.length > 0) exitCode = 0;  // DSH 正常完成
  else if (code === 0) exitCode = 2;           // exit 0 但零工具调用:视为 DSH 自身未完成(记录在 result.json)
  else exitCode = 2;                           // DSH 自身失败(真实退出码在 result.json.childExitCode)
});
