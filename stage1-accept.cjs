#!/usr/bin/env node
// stage1-accept.cjs — 一阶段独立验收 v2(§二修正版)
// 修正点:① 真跑 npm test(真实退出码+原始输出判读,非文本匹配) ② 新增/修改/删除三类差异
//        ③ 模型路由与费用改为实际核查 free-ladder.log(核查不了如实标"未验证")
//        ④ 区分"模型尝试跑测试"与"测试实际执行并通过"
// 数据边界:本脚本只写/删 验收项目目录内的 tasks.json(tasks.json 属运行产物,不属代码),不触碰其他任何路径。
// 用法: node stage1-accept.cjs <stage1目录> [验收的项目目录,默认 C:/Users/64562/dsh-stage1]
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OUT = process.argv[2];
const PROJECT = process.argv[3] || 'C:/Users/64562/dsh-stage1';
const LADDER_LOG = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log';
if (!OUT || !fs.existsSync(path.join(OUT, 'result.json'))) { console.error('用法: node stage1-accept.cjs <stage1目录> [项目目录]'); process.exit(2); }

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail: String(detail).slice(0, 240) }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  | ' + String(detail).slice(0, 140) : '')); };

function runCli(args) {
  try {
    const r = spawnSync(process.execPath, ['cli.js', ...args], { cwd: PROJECT, encoding: 'utf8', timeout: 20000 });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (e) { return { code: -1, stdout: '', stderr: String(e.message).slice(0, 120) }; }
}

/* ① 独立功能操作 v3 —— 三态判别矩阵:命令不存在 / ID不存在 / 成功未持久化,每种失败有专属标签。
   责任边界(§评审二):运行器只忠实传回 exit/输出(v2 已修);CLI 产出契约信号;本验收按
   【信号形态 + 状态变更】双证判定,不再以"非零退出"泛判异常。
   修正的 v2 误判:done 不存在时 usage 兜底让 "done 99 非零退出" 假绿。
   CLI 契约:未知命令=exit1+usage;done 未知 ID=exit1+task not found(非 usage);done 成功=exit0+文件实变。 */
try {
  const tp = path.join(PROJECT, 'tasks.json');
  fs.writeFileSync(tp, JSON.stringify([{ id: 1, text: 'alpha', done: false }, { id: 2, text: 'beta', done: false }], null, 2) + '\n');
  const h0 = crypto.createHash('sha256').update(fs.readFileSync(tp)).digest('hex').slice(0, 16);
  const sig = (r) => ({ exit: r.code, usage: /usage/i.test(r.stdout + r.stderr), notfound: /task not found/i.test(r.stdout + r.stderr), out: ((r.stdout || '') + (r.stderr || '')).trim() });

  let r = runCli(['done', '1']);
  const a = sig(r);
  if (a.usage && a.exit !== 0) check('CASE_A 命令存在性', false, '命令不存在:done 未实现(返回 usage 形态)');
  else check('CASE_A 命令存在性', true, a.exit === 0 ? 'done 可调用' : `done 可调用(错误形态非 usage,exit=${a.exit})`);

  r = runCli(['done', '99']);
  const b = sig(r);
  if (b.usage) check('CASE_B ID不存在报错', false, '误判路径实锤:done 99 落入 usage 兜底 → 实为命令不存在(v2 曾在此假绿)');
  else if (b.exit === 0) check('CASE_B ID不存在报错', false, '契约违约:ID 不存在但退出 0');
  else if (!b.notfound) check('CASE_B ID不存在报错', false, `退出 ${b.exit} 但错误信息不含 task not found: ${b.out.slice(0, 60)}`);
  else check('CASE_B ID不存在报错', true, `exit=${b.exit} + task not found`);

  r = runCli(['done', '1']);
  const c = sig(r);
  const h1 = fs.existsSync(tp) ? crypto.createHash('sha256').update(fs.readFileSync(tp)).digest('hex').slice(0, 16) : null;
  const content = h1 ? (() => { try { return JSON.parse(fs.readFileSync(tp, 'utf8')); } catch { return null; } })() : null;
  if (c.exit !== 0) check('CASE_C 成功并持久化', false, `done 1 非零退出: ${c.out.slice(0, 60)}`);
  else if (h1 === h0) check('CASE_C 成功并持久化', false, 'CASE_C 执行成功但没有持久化:tasks.json 哈希未变(stdout 声称成功不算数)');
  else if (!(content && content.some((t) => t.id === 1 && t.done === true))) check('CASE_C 成功并持久化', false, '文件已变但 id1.done≠true');
  else check('CASE_C 成功并持久化', true, `哈希 ${h0}→${h1} 且 done=true`);

  r = runCli(['list']);
  check('功能:list 反映 [x]/[ ]', r.code === 0 && /\[x\]\s*1 alpha/.test(r.stdout) && /\[ \]\s*2 beta/.test(r.stdout), r.stdout.trim().replace(/\n/g, ' | '));
  fs.rmSync(tp);
} catch (e) { check('功能块异常', false, e.message); }

/* ② 真跑 npm test:真实退出码 + 原始输出判读(Windows 经 cmd /c 走 npm) */
try {
  const r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm test'], { cwd: PROJECT, encoding: 'utf8', timeout: 90000 });
  const raw = (r.stdout || '') + (r.stderr || '');
  const pm = raw.match(/pass\s+(\d+)/); const fm = raw.match(/fail\s+(\d+)/);
  const ok = r.status === 0 && Number(fm && fm[1] || 0) === 0 && Number(pm && pm[1] || 0) > 0;
  check('测试:npm test 真实执行且通过(exit=0)', ok, `exit=${r.status} pass=${pm && pm[1]} fail=${fm && fm[1]}`);
} catch (e) { check('测试:npm test 运行异常', false, String(e.message).slice(0, 120)); }

/* ③ 三类差异:新增/修改/删除 */
const before = JSON.parse(fs.readFileSync(path.join(OUT, 'state-before.json'), 'utf8')).before;
const after = {};
(function walk(d, rel) {
  let entries; try { entries = fs.readdirSync(d); } catch { return; }
  for (const f of entries) {
    if (f === 'node_modules' || f === 'tasks.json') continue;
    const p = path.join(d, f); const r = rel ? rel + '/' + f : f;
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, r);
    else after[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
  }
})(PROJECT, '');
const modified = Object.keys(after).filter((k) => before[k] && before[k] !== after[k]);
const added = Object.keys(after).filter((k) => !before[k]);
const deleted = Object.keys(before).filter((k) => !after[k]);
const touched = [...modified, ...added, ...deleted];
check('差异:有实际改动', touched.length > 0, `改=${modified.length} 增=${added.length} 删=${deleted.length} → ${touched.slice(0, 8).join(',')}`);
const unexpected = touched.filter((k) => !/^(commands\.js|cli\.js|storage\.js|test\/|README\.md|package\.json$)/.test(k));
check('差异:无越界改动', unexpected.length === 0, unexpected.join(',') || 'clean');

/* ④ 轨迹复核:模型尝试 vs 实际执行;护栏;往返完整性(仅真实 DSH 运行判定;假 bin 样本标未验证) */
const result = JSON.parse(fs.readFileSync(path.join(OUT, 'result.json'), 'utf8'));
const stateBefore = JSON.parse(fs.readFileSync(path.join(OUT, 'state-before.json'), 'utf8'));
const isFakeDsh = /fake-dsh/.test(String(stateBefore.dshBin || ''));
const events = fs.existsSync(path.join(OUT, 'events.jsonl'))
  ? fs.readFileSync(path.join(OUT, 'events.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const toolCalls = events.filter((e) => e.type === 'tool_call');
const toolResults = events.filter((e) => e.type === 'tool_result');
if (isFakeDsh) {
  checks.push(
    { name: '轨迹:读过项目', ok: null, state: 'unverified', detail: '假 DSH 样本,无模型轨迹' },
    { name: '轨迹:完整往返', ok: null, state: 'unverified', detail: '假 DSH 样本,无模型轨迹' },
    { name: '轨迹:模型尝试运行测试', ok: null, state: 'unverified', detail: '假 DSH 样本,无模型轨迹' },
  );
  console.log('  未验证 轨迹三项 | 假 DSH 样本无模型轨迹(设计内)');
} else {
  check('轨迹:读过项目(read/grep/glob)', /read|grep|glob/i.test(toolCalls.map((e) => e.tool).join(',')), toolCalls.map((e) => e.tool).join(',').slice(0, 160));
  check('轨迹:完整往返(工具调用≥1 且 结果回传≥1 且 调用后有后续调用)', toolCalls.length >= 1 && toolResults.length >= 1 && toolCalls.length > toolResults.length - 1 && toolCalls.length + toolResults.length >= 4, `call=${toolCalls.length} result=${toolResults.length}`);
  const modelTestAttempts = toolCalls.filter((e) => /--test|npm\s+test/i.test(JSON.stringify(e.input || {}))).length;
  check('轨迹:模型尝试运行测试', modelTestAttempts > 0, `含测试命令的调用=${modelTestAttempts} 次(实际通过与否见②,两者独立判定)`);
}

/* ⑤ 模型路由与费用:实际核查 free-ladder.log(核查不了如实标"未验证",不计入失败分母) */
let routeNote = '未验证';
let routePaid = null; let routeModels = [];
if (result.sessionId && fs.existsSync(LADDER_LOG)) {
  const lines = fs.readFileSync(LADDER_LOG, 'utf8').split('\n').filter((l) => l.includes(result.sessionId));
  const evs = lines.map((l) => { try { return JSON.parse(l.slice(25)); } catch { return null; } }).filter(Boolean);
  routeModels = [...new Set(evs.filter((e) => e.to || e.current).map((e) => String(e.to || e.current)))].slice(0, 6);
  routePaid = evs.some((e) => e.ev === 'paid_switch' || e.ev === 'paid_admitted');
  if (evs.length === 0) {
    routeNote = '路由层零事件(请求未过路由层,如实标注)';
    checks.push({ name: '路由:零付费(实际核查 ladder 日志)', ok: null, state: 'unverified', detail: routeNote });
    console.log('  未验证 路由:零付费 | ' + routeNote);
  } else {
    routeNote = `VERIFIED: ${evs.length} 事件, 模型=[${routeModels.join(', ')}], paid=${routePaid}`;
    check('路由:零付费(实际核查 ladder 日志)', routePaid === false, routeNote);
  }
} else {
  routeNote = '未验证:sessionId 缺失或日志不可读';
  checks.push({ name: '路由:零付费(实际核查 ladder 日志)', ok: null, state: 'unverified', detail: routeNote });
  console.log('  未验证 路由:零付费 | ' + routeNote);
}

const failed = checks.filter((c) => c.ok === false).length;
const verified = checks.filter((c) => c.ok === true).length;
const unverified = checks.filter((c) => c.ok === null).length;
const report = {
  at: new Date().toISOString(), stage: 1, project: PROJECT,
  prompt: JSON.parse(fs.readFileSync(path.join(OUT, 'state-before.json'), 'utf8')).prompt,
  result: { ms: result.ms, killed: result.killed, childExitCode: result.childExitCode, toolCalls: result.toolCallCount, toolResults: result.toolResultCount, sessionId: result.sessionId },
  route: { note: routeNote, models: routeModels, paid: routePaid },
  checks, verified, unverified, failed,
  verdict: failed > 0 ? 'FAIL' : (unverified > 0 ? 'PASS_WITH_UNVERIFIED' : 'PASS'),
};
fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(report, null, 2));
console.log(`\n独立验收: 通过${verified} 失败${failed} 未验证${unverified} → ${report.verdict}(明细: ${path.join(OUT, 'acceptance.json')})`);
process.exitCode = report.verdict === 'FAIL' ? 1 : 0;
