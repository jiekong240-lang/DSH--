'use strict';
/**
 * 监督循环 / Guardian
 * 
 * CORE - 首要核心，勿删除
 * Supervisor / Guardian 闭环与人工批准通道
 * 
 * TRACE 2026-11-08: 成功运行后触发经验学习（API 总结）
 * TRACE 2026-11-08+: 审计包含 verification（compareObservations 结果）
 */
const fs = require('fs');
const path = require('path');
const { onSuccessfulRun } = require('./experience');

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

function requestHumanApproval(decision, reason) {
  try {
    ensureDir(APPROVAL_FILE);
    let list = [];
    if (fs.existsSync(APPROVAL_FILE)) {
      try { list = JSON.parse(fs.readFileSync(APPROVAL_FILE, 'utf8')) || []; } catch { list = []; }
    }
    const item = {
      id: 'appr-' + Date.now(),
      decision: decision || null,
      reason: String(reason || '').slice(0, 200),
      status: 'pending',
      ts: Date.now(),
    };
    list.push(item);
    fs.writeFileSync(APPROVAL_FILE, JSON.stringify(list, null, 2));
    return item.id;
  } catch {
    return null;
  }
}

async function supervise(ctx) {
  const resultOk = !!(ctx.result && ctx.result.ok);
  const record = {
    task: ctx.task && ctx.task.id,
    step: ctx.decision && ctx.decision.step,
    resultOk,
    verification: ctx.verification || null,
    note: 'supervise cycle',
  };
  console.log('[CUA supervisor]', record);
  writeAudit(record);

  if (ctx.gate && !ctx.gate.allow && (ctx.gate.level >= 3 || ctx.gate.verdict === 'BLOCKED_L3_NEEDS_HUMAN')) {
    const apprId = requestHumanApproval(ctx.decision, ctx.gate.reason);
    return { continued: false, needsHuman: true, approvalId: apprId, audited: true };
  }

  if (!resultOk && ctx.result && ctx.result.error) {
    writeAudit({ ...record, note: 'action failed', error: ctx.result.error });
    return { continued: true, failed: true, audited: true };
  }

  // 成功运行 → 触发经验学习（API 总结）
  if (resultOk && ctx.task) {
    const trace = {
      taskId: ctx.task.id,
      goal: ctx.task.goal,
      steps: ctx.task.steps,
      result: ctx.result,
      observationSummary: ctx.verified && ctx.verified.note,
      verification: ctx.verification,
    };
    // 非阻塞，失败不影响主流程
    onSuccessfulRun(trace).catch((e) => {
      writeAudit({ ...record, note: 'experience summary failed', error: e.message });
    });
  }

  return { continued: true, audited: true, experienceTriggered: resultOk };
}

module.exports = { supervise, writeAudit, requestHumanApproval };
