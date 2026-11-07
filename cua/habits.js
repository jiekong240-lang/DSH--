'use strict';
/**
 * 用户键盘与鼠标习惯记录
 * 
 * CORE - 首要核心，勿删除
 * 记录用户操作习惯，供 CUA 自我学习与升级
 * 
 * 注意：
 * - 仅记录模式（坐标、动作类型、间隔），不存储敏感文本
 * - 默认关闭，需明确启用
 * - 数据仅存本地
 * 
 * TRACE 2026-11-08: 初始实现
 */
const fs = require('fs');
const path = require('path');

const HABITS_FILE = path.join(__dirname, '..', 'state', 'habits.jsonl');
let enabled = false;

function ensureDir() {
  const dir = path.dirname(HABITS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function setEnabled(flag) {
  enabled = !!flag;
}

function isEnabled() {
  return enabled;
}

/**
 * 记录一条习惯事件
 * @param {object} event { type: 'mouse'|'key', action, x?, y?, interval?, meta? }
 */
function recordHabit(event) {
  if (!enabled) return false;
  try {
    ensureDir();
    const entry = {
      ts: Date.now(),
      type: event.type || 'unknown',
      action: event.action || 'unknown',
      x: Number.isFinite(event.x) ? Math.round(event.x) : undefined,
      y: Number.isFinite(event.y) ? Math.round(event.y) : undefined,
      interval: Number.isFinite(event.interval) ? event.interval : undefined,
      meta: event.meta || undefined,
    };
    // 不保存原始文本，只保存统计特征
    if (entry.action === 'type') {
      entry.length = event.length || 0;
      delete entry.meta;
    }
    fs.appendFileSync(HABITS_FILE, JSON.stringify(entry) + '\n');
    return true;
  } catch (e) {
    console.error('[habits] record failed:', e.message);
    return false;
  }
}

/**
 * 读取最近的习惯记录（供学习使用）
 */
function loadRecentHabits(limit = 200) {
  try {
    if (!fs.existsSync(HABITS_FILE)) return [];
    const lines = fs.readFileSync(HABITS_FILE, 'utf8').trim().split('\n');
    const recent = lines.slice(-limit);
    return recent.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 简单统计：动作频率、常用坐标区域
 */
function summarizeHabits(limit = 500) {
  const events = loadRecentHabits(limit);
  const stats = { total: events.length, byAction: {}, avgInterval: 0 };
  let intervalSum = 0;
  let intervalCount = 0;
  for (const e of events) {
    stats.byAction[e.action] = (stats.byAction[e.action] || 0) + 1;
    if (e.interval) {
      intervalSum += e.interval;
      intervalCount++;
    }
  }
  if (intervalCount) stats.avgInterval = Math.round(intervalSum / intervalCount);
  return stats;
}

module.exports = {
  setEnabled,
  isEnabled,
  recordHabit,
  loadRecentHabits,
  summarizeHabits,
};
