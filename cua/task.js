'use strict';
/**
 * Durable CUA task checkpoint. A committed "in-flight" marker prevents a
 * restarted process from replaying a click/type whose outcome is unknown.
 * Loading corrupt state is an error, never "no task".
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const TASK_FILE = path.join(__dirname, '..', 'state', 'cua-task.json');

function createTaskStore(file = TASK_FILE) {
  function validate(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task) ||
        !Array.isArray(task.steps)) throw new Error('TASK_STATE_INVALID');
    return task;
  }

  function loadTask() {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw new Error('TASK_STATE_UNREADABLE', { cause: error });
    }
    let parsed;
    try { parsed = JSON.parse(content); }
    catch (error) { throw new Error('TASK_STATE_CORRUPT', { cause: error }); }
    return validate(parsed);
  }

  function saveTask(task) {
    validate(task);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    let fd;
    try {
      fd = fs.openSync(temp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(task, null, 2) + '\n', 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(temp, file);
    } finally {
      if (fd !== undefined && fd !== null) { try { fs.closeSync(fd); } catch {} }
      try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return true;
  }

  function beginAction(task, step) {
    validate(task);
    if (task.pendingAction) throw new Error('PENDING_ACTION_RECONCILIATION');
    const next = {
      ...task,
      pendingAction: {
        id: crypto.randomUUID(),
        action: String(step?.action || 'unknown'),
        step: step || null,
        recordedAt: new Date().toISOString(),
        state: 'outcome-unknown-until-verified',
      },
      updatedAt: Date.now(),
    };
    // Persist BEFORE the physical action. Failure means no action is sent.
    saveTask(next);
    return next;
  }

  function advanceTask(task) {
    validate(task);
    if (!task.steps.length) return task;
    const next = { ...task, steps: task.steps.slice(1), retries: 0,
      updatedAt: Date.now(), lastSuccessAt: Date.now() };
    delete next.pendingAction;
    saveTask(next);
    return next;
  }

  function recordFailure(task, reason) {
    validate(task);
    const next = { ...task, retries: (task.retries || 0) + 1,
      lastFailure: { reason, ts: Date.now() }, updatedAt: Date.now() };
    // A write with unknown outcome retains pendingAction for human/agent
    // reconciliation before another attempt.
    saveTask(next);
    return next;
  }

  return { loadTask, saveTask, beginAction, advanceTask, recordFailure };
}

const standard = createTaskStore();
function decide(task, observation) {
  if (!task || !Array.isArray(task.steps) || task.steps.length === 0) return null;
  return {
    taskId: task.id,
    step: task.steps[0],
    observationSummary: observation?.note,
    retries: task.retries || 0,
  };
}
function shouldRetry(task, maxRetries = 3) {
  return (task.retries || 0) < maxRetries;
}
module.exports = {
  ...standard,
  createTaskStore,
  decide,
  shouldRetry,
};
