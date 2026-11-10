'use strict';
/**
 * Windows CUA 主入口
 * 混合观察 → 决策 → 执行 → 验证 → 回写（支持多步 + 失败恢复）
 *
 * agent-desktop 深度参与：观察带 @ref、执行优先走 ad-* 通道、验证时对比树变化
 */
const { observe, compareObservations, prepareVisionPayload } = require('./observer');
const { decide, loadTask, saveTask, beginAction, advanceTask, recordFailure } = require('./task');
const { execute } = require('./action');
const { supervise } = require('./supervisor');
const { checkGate } = require('./gate');
const { findElementsByName, parseBoundingRectangle } = require('./accessibility');
const { suggestFromVision } = require('./brain');
const { verifyStep } = require('./step-verify');

const MAX_STEPS = 20;
const READ_ACTIONS = new Set(['observe', 'list', 'snapshot', 'ad-snapshot']);

// The model may supply grounding, not rewrite the task contract. In particular,
// the model must not substitute a different action/text/expected postcondition,
// then cause advanceTask() to consume an unrelated planned step.
function mergeBrainGrounding(planned, proposed, observation = {}) {
  if (!planned || !proposed || typeof proposed !== 'object') return planned;
  if (String(planned.action || '').toLowerCase() !== String(proposed.action || '').toLowerCase()) return planned;
  const grounded = { ...planned };

  // A guessed pixel is never an authoritative target. Coordinates must
  // come from the original task or a unique real UIA element.
  if (!planned.ref && typeof proposed.ref === 'string') {
    const ref = proposed.ref.trim();
    const observedRefs = String(observation.agentDesktop || '').match(/[@#][A-Za-z0-9_-]+/g) || [];
    if (/^[@#][A-Za-z0-9_-]{1,80}$/.test(ref) && observedRefs.includes(ref)) {
      grounded.ref = ref;
    }
  }
  return grounded;
}
async function resolveStepCoordinates(step, observation, locator = findElementsByName) {
  if (!step || step.x != null || !step.targetName) return step;
  // 优先尝试 agent-desktop @ref（如果观察里已有快照）
  const grounded = { ...step };
  if (observation?.agentDesktop && step.targetName) grounded.preferAgentDesktop = true;
  try {
    const found = await locator(step.targetName, 3);
    const matches = Array.isArray(found?.matches) ? found.matches : [];
    const exact = matches.filter(el => String(el.Name || '').trim().toLowerCase() ===
      String(step.targetName).trim().toLowerCase());
    const candidates = exact.length ? exact : matches;
    // Never click the first element of an ambiguous result set.
    if (candidates.length !== 1) return grounded;
    const rect = parseBoundingRectangle(candidates[0].BoundingRectangle);
    if (rect) {
      return {
        ...grounded,
        x: rect.centerX,
        y: rect.centerY,
        resolvedFrom: candidates[0].Name,
        resolvedNote: found.note,
      };
    }
  } catch (e) {
    console.log('[CUA] resolve targetName failed:', e.message);
  }
  return grounded;
}

async function runOnce(task, ports = {}) {
  // Reconcile a crashed write using a NEW observation, never by replaying
  // the physical action. Only an explicit, observable postcondition allows
  // progress; missing evidence preserves the in-flight checkpoint.
  if (task?.pendingAction) {
    const pending = task.pendingAction;
    const planned = Array.isArray(task.steps) ? task.steps[0] : null;
    if (!planned || String(planned.action) !== String(pending.step?.action)) {
      return { done: true, reason: 'PENDING_ACTION_PLAN_MISMATCH', pendingAction: pending };
    }
    let observed;
    try {
      observed = await (ports.observe || observe)({
        includeAx: true, app: task.app || task.adApp,
      });
    } catch (error) {
      return { done: true, reason: 'PENDING_ACTION_OBSERVATION_FAILED',
        pendingAction: pending, error: String(error.message || error) };
    }
    const verified = verifyStep(pending.step, null, observed, { ok: true });
    if (verified.status !== 'verified') {
      return { done: true, reason: 'PENDING_ACTION_RECONCILIATION',
        pendingAction: pending, verification: verified };
    }
    try {
      const nextTask = (ports.advanceTask || advanceTask)(task);
      return { done: false, recovered: true, reason: 'PENDING_ACTION_POSTCONDITION_VERIFIED',
        nextTask, verification: { ...verified, source: 'recovery_observation_only' } };
    } catch (error) {
      return { done: true, reason: 'PENDING_ACTION_ADVANCE_FAILED',
        pendingAction: pending, error: String(error.message || error) };
    }
  }
  const beginNow = ports.beginAction || beginAction;
  const observeNow = ports.observe || observe;
  const executeNow = ports.execute || execute;
  const proposeNow = ports.suggestFromVision || suggestFromVision;
  const gateNow = ports.checkGate || checkGate;
  const superviseNow = ports.supervise || supervise;
  const advanceNow = ports.advanceTask || advanceTask;
  const failureNow = ports.recordFailure || recordFailure;
  // 混合观察（含 agent-desktop，如果任务指定了 app）
  const observation = await observeNow({
    includeAx: true,
    app: task.app || task.adApp,
  });

  let suggested = null;
  try {
    suggested = await proposeNow(prepareVisionPayload(observation), task);
  } catch (e) {
    console.log('[CUA] brain suggest skipped:', e.message);
  }

  let decision = decide(task, observation);
  if (!decision) return { done: true, reason: 'no more steps', observation };
  if (suggested && suggested.step) {
    decision = { ...decision, step: mergeBrainGrounding(decision.step, suggested.step, observation), fromBrain: true };
  }

  if (decision.step) {
    const locator = ports.findElementsByName || findElementsByName;
    decision.step = await resolveStepCoordinates(decision.step, observation, locator);
    const action = String(decision.step.action || '').toLowerCase();
    if (decision.step.targetName && ['click', 'move', 'mousemove'].includes(action) &&
        (!Number.isFinite(decision.step.x) || !Number.isFinite(decision.step.y))) {
      return { done: true, reason: 'TARGET_UNRESOLVED', observation };
    }
  }

  const gate = gateNow(decision);
  if (!gate.allow) {
    console.log('[CUA] blocked by gate:', gate.reason, gate.verdict);
    return { blocked: true, reason: gate.reason, gate, observation };
  }

  if (observation.screenshotError) {
    console.log('[CUA] warning: screenshot incomplete');
  }

  let activeTask = task;
  const mutating = !READ_ACTIONS.has(String(decision.step?.action || '').toLowerCase());
  if (mutating) {
    try {
      activeTask = beginNow(task, decision.step);
    } catch (error) {
      return { done: true, reason: 'PRE_ACTION_CHECKPOINT_FAILED', error: String(error.message || error) };
    }
  }

  let result;
  try {
    result = await executeNow(decision);
  } catch (error) {
    result = { ok: false, error: String(error.message || error) };
  }
  let verified;
  try {
    verified = await observeNow({ includeAx: true, app: task.app || task.adApp });
  } catch (error) {
    verified = null; // unknown outcome must not advance the task
  }
  const observationDelta = compareObservations(observation, verified);
  const verification = verifyStep(decision.step, observation, verified, result);
  verification.observationDelta = observationDelta;

  const sup = await superviseNow({ task: activeTask, decision, result, verified, gate, verification });

  if (verification.status === 'verified') {
    try {
      const nextTask = advanceNow(activeTask);
      return { done: false, result, verified, verification, nextTask, supervised: sup };
    } catch (error) {
      return { done: true, reason: 'POST_ACTION_PERSIST_FAILED', error: String(error.message || error),
        result, verified, verification, supervised: sup };
    }
  }

  // Do not replay a potentially dispatched click/type merely because the
  // driver returned an error or the new screenshot has a different filename.
  // Keep the current step for a fresh observation / explicit replanning.
  const reason = verification.reason || 'STEP_NOT_VERIFIED';
  try {
    const failedTask = failureNow(activeTask, reason);
    return { done: true, reason, result, verified, verification, nextTask: failedTask, supervised: sup };
  } catch (error) {
    return { done: true, reason: 'FAILURE_RECORD_PERSIST_FAILED', error: String(error.message || error),
      result, verified, verification, supervised: sup };
  }
}

async function main() {
  console.log('[CUA] core started (agent-desktop deep + hybrid observe + multi-step + verification)');

  let task = loadTask();
  if (!task) {
    task = {
      id: 'demo-' + Date.now(),
      goal: 'observe windows then stop',
      steps: [{ action: 'observe' }],
      createdAt: Date.now(),
    };
    saveTask(task);
    console.log('[CUA] created default task');
  }

  let steps = 0;
  let current = task;
  while (steps < MAX_STEPS) {
    const out = await runOnce(current);
    console.log('[CUA] step', steps, JSON.stringify({
      done: out.done,
      blocked: out.blocked,
      reason: out.reason,
      retried: out.retried,
      ad: !!(out.verification && out.verification.observationDelta && out.verification.observationDelta.adChanged),
    }, null, 0));
    if (out.done || out.blocked) {
      console.log('[CUA] finished:', out.reason || 'blocked');
      break;
    }
    if (out.nextTask) current = out.nextTask;
    steps++;
    if (out.retried) continue;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (steps >= MAX_STEPS) console.log('[CUA] reached max steps');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runOnce, mergeBrainGrounding, resolveStepCoordinates };
