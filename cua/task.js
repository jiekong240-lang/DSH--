'use strict';
/**
 * 任务契约与决策
 * 
 * CORE - 首要核心，勿删除
 * 任务契约驱动的多步规划与失败恢复
 * 
 * TRACE 2026-11-08: 增加失败记录、重试计数、恢复点
 */
const fs = require('fs');
const path = require('path');

const TASK_FILE = path.join(__dirname, '..', 'state', 'cua-task.json');

function ensureDir() {
  const dir = path.dirname(TASK_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTask() {
  try {
    if (!fs.existsSync(TASK_FILE)) return null;
    return JSON.parse(fs.readFileSync(TASK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveTask(task) {
  try {
    ensureDir();
    fs.writeFileSync(TASK_FILE, JSON.stringify(task, null, 2));
    return true;
  } catch {
    return false;
  }
}

function decide(task, observation) {
  if (!task || !task.steps || task.steps.length === 0) return null;
  const next = task.steps[0];
  return {
    taskId: task.id,
    step: next,
    observationSummary: observation.note,
    retries: task.retries || 0,
  };
}

function advanceTask(task) {
  if (!task || !Array.isArray(task.steps) || task.steps.length === 0) return task;
  const next = {
    ...task,
    steps: task.steps.slice(1),
    updatedAt: Date.now(),
    lastSuccessAt: Date.now(),
  };
  saveTask(next);
  return next;
}

/**
 * CORE: 失败恢复
 * 记录失败并决定是否重试
 */
function recordFailure(task, reason) {
  const next = {
    ...task,
    retries: (task.retries || 0) + 1,
    lastFailure: { reason, ts: Date.now() },
    updatedAt: Date.now(),
  };
  saveTask(next);
  return next;
}

function shouldRetry(task, maxRetries = 3) {
  return (task.retries || 0) < maxRetries;
}

module.exports = { decide, loadTask, saveTask, advanceTask, recordFailure, shouldRetry };
