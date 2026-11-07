// e2e-verify.cjs — 技术验证运行器: T1 低档起步 / T2 复杂度高档起步 / 证据采集
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SANDBOX = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const DSH_BIN = SANDBOX + '/node_modules/@deepseek-ai/dsh/lib/bin.js';
const LADDER_LOG = 'C:/Users/64562/.dsh/free-ladder.log';
const VERIFY_DIR = 'C:/Users/64562/dsh-e2e-verify';
const MARK = 'E2E-MARK-' + Date.now();

function runDsh(cwd, task) {
  const out = execFileSync(process.execPath, [DSH_BIN, '--profile', 'headless', task], {
    cwd, encoding: 'utf8', timeout: 240000, windowsHide: true,
  });
  return out;
}

function ladderEventsSince(mark) {
  const lines = fs.readFileSync(LADDER_LOG, 'utf8').trim().split('\n');
  const out = [];
  for (const l of lines) {
    const head = l.slice(0, 24);
    if (head < mark) continue;
    try { out.push(JSON.parse(l.slice(24))); } catch { }
  }
  return out;
}

fs.mkdirSync(VERIFY_DIR, { recursive: true });
const runStart = new Date(Date.now() - 2000).toISOString();
console.log('MARK:', MARK, '| runStart:', runStart);

// ── T1: 极简任务 → 期望智能起步在低档(score 0)──
console.log('\n[T1] 极简任务(短提示词 → 期望梯底起步)...');
const t1 = runDsh(VERIFY_DIR, '创建 t1-ok.txt 内容一行 e2e-t1。完成即结束。');
console.log('T1 reply-tail:', t1.split('\n').filter((l) => l.trim()).pop().slice(0, 120));

// ── T2: 复杂任务 → 期望智能起步跳高档(score 高: 多关键词 + 长文)──
console.log('\n[T2] 复杂任务(架构级重构演练,系统化完整全部,工程化实现与测试通过...)');
const longBody = Array.from({ length: 30 }, (_, i) => '本任务要求系统化的架构思维与完整的工程实现,全部步骤需要测试通过,属于重构与迁移性质的工程演练。').join(' ');
const t2 = runDsh(VERIFY_DIR, '本任务是架构级重构演练的一部分,需要系统化、完整、全部到位:请实现一个完整的小型配置模块 config-e2e.js(CommonJS,含 load/save/validate 三个方法,全部真实代码),并实现其测试思路说明。这是工程化系统重构演练,请认真完整实现。' + longBody);
console.log('T2 reply-tail:', t2.split('\n').filter((l) => l.trim()).pop().slice(0, 120));

// ── 证据: 梯子事件 ──
console.log('\n===== 梯子事件(本次验证窗口) =====');
const evs = ladderEventsSince(runStart).filter((e) => ['smart_start', 'rotate', 'cooldown', 'saw'].includes(e.ev));
evs.forEach((e) => console.log(' ', e.ev, '|', e.code || '', '|', e.from || '', '->', e.to || '', '| score:', e.score ?? '', '| rung:', e.rung ?? '', '| rung-idx:', e.idx ?? ''));

const smart = evs.filter((e) => e.ev === 'smart_start');
console.log('\nSMART-START 次数:', smart.length);
smart.forEach((s) => console.log('  score', s.score, '→', s.to, '(rung', s.rung + ')'));

// ── 产物核验 ──
console.log('\n===== 产物 =====');
for (const f of ['t1-ok.txt', 'config-e2e.js']) {
  const p = path.join(VERIFY_DIR, f);
  console.log(' ', f, fs.existsSync(p) ? 'EXISTS ' + Math.round(fs.statSync(p).size / 1024 * 10) / 10 + 'KB' : 'MISSING');
}
console.log('E2E-MARK:', MARK);
