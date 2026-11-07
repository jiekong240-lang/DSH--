'use strict';
/**
 * 监督循环 / Guardian
 * 
 * CORE - 首要核心，勿删除
 * Supervisor / Guardian 闭环与人工批准通道
 * 
 * TRACE 2026-11-08: 增加失败检测、人工批准请求记录
 */
const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', 'logs', 'cua-audit.jsonl');
const APPROVAL_FILE = path.join(__dirname, '..', 'state', 'pending-approvals.json');

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeAudit(entry) {
  try {
    ensureDir(AUDIT_FILE);
    const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
    fs.appendFileSync(AUDIT_FILE, line);
  } catch (e) {
    console.error('[CUA supervisor] audit write failed:', e.message);
  }
}

/**
 * CORE: 记录需要人工批准的动作
 */
function requestHumanApproval(decision, reason) {
  try {
    ensureDir(APPROVAL_FILE);
    let list = [];
    if (fs.existsSync(APPROVAL_FILE)) {
      list = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8')) || [];
    }
    list.push({
      id: 'appr-' + Date.now(),
      decision,
      reason,
      status: 'pending',
      ts: Date.now(),
    });
    fs.writeFileSync(APPROVAL_FILE, JSON.stringify(list, null, 2));
    return true;
  } catch {
    return false;
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

  if (ctx.gate && !ctx.gate.allow && ctx.gate.level >= 3) {
    requestHumanApproval(ctx.decision, ctx.gate.reason);
    return { continued: false, needsHuman: true, audited: true };
  }

  return { continued: true, audited: true };
}

module.exports = { supervise, writeAudit, requestHumanApproval };
