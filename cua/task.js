'use strict';
/**
 * 任务契约与决策
 * 
 * TRACE 2026-11-08: 增加本地持久化（state/cua-task.json）
 * 支持加载 / 保存任务状态
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
  };
}

function advanceTask(task) {
  if (!task || !Array.isArray(task.steps) || task.steps.length === 0) return task;
  const next = { ...task, steps: task.steps.slice(1), updatedAt: Date.now() };
  saveTask(next);
  return next;
}

module.exports = { decide, loadTask, saveTask, advanceTask };
