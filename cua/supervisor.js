'use strict';
/**
 * 监督循环
 * 检查执行结果、记录审计、决定是否重试或中止。
 * 
 * TRACE 2026-11-08: 增加本地审计日志写入（logs/cua-audit.jsonl）
 * 下次修改时可查此文件与 docs/CUA_PROGRESS.md
 */
const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', 'logs', 'cua-audit.jsonl');

function ensureLogDir() {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeAudit(entry) {
  try {
    ensureLogDir();
    const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
    fs.appendFileSync(AUDIT_FILE, line);
  } catch (e) {
    console.error('[CUA supervisor] audit write failed:', e.message);
  }
}

async function supervise(ctx) {
  const record = {
    task: ctx.task && ctx.task.id,
    step: ctx.decision && ctx.decision.step,
    resultOk: !!(ctx.result && ctx.result.ok),
    note: 'supervise cycle',
  };
  console.log('[CUA supervisor]', record);
  writeAudit(record);
  // TODO: 更新任务状态、判断是否需要人工介入
  return { continued: true, audited: true };
}

module.exports = { supervise, writeAudit };
