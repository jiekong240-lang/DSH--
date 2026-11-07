'use strict';
/* ============================================================
 * 哨兵 · 记忆库 (综述§6: SQLite 单文件; 手册§9: 分层记忆)
 *   工作记忆 = 当轮上下文(进程内)   档案/经验 = lessons 表
 *   事件/提案/大脑调用逐笔入库 = 可审计、可回放
 * ============================================================ */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

class Memory {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.dbPath = path.join(dir, 'sentinel.db');
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        trigger TEXT NOT NULL,
        duration_ms INTEGER, signals INTEGER, proposals INTEGER,
        toasts INTEGER, llm_calls INTEGER, degraded INTEGER, note TEXT
      );
      CREATE TABLE IF NOT EXISTS events_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER, ts TEXT NOT NULL,
        source TEXT, type TEXT, value TEXT, priority TEXT, suppressed INTEGER
      );
      CREATE TABLE IF NOT EXISTS proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER, ts TEXT NOT NULL,
        fact TEXT, reason TEXT, action_tool TEXT, action_level INTEGER,
        undo TEXT, confidence TEXT, verdict TEXT, executed INTEGER,
        brain TEXT, note TEXT
      );
      CREATE TABLE IF NOT EXISTS llm_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL, provider TEXT, model TEXT,
        ok INTEGER, fail_type TEXT, prompt_tokens INTEGER,
        completion_tokens INTEGER, ms INTEGER, free INTEGER, cost_cny REAL
      );
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL, kind TEXT, text TEXT
      );
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER, ts TEXT NOT NULL,
        cpu REAL, mem REAL, disk_free_min REAL
      );
    `);
    this.st = {
      insCycle: this.db.prepare(
        'INSERT INTO cycles (started_at, trigger) VALUES (?, ?)'),
      endCycle: this.db.prepare(
        'UPDATE cycles SET duration_ms=?, signals=?, proposals=?, toasts=?, llm_calls=?, degraded=?, note=? WHERE id=?'),
      insEvent: this.db.prepare(
        'INSERT INTO events_log (cycle_id, ts, source, type, value, priority, suppressed) VALUES (?,?,?,?,?,?,?)'),
      insProp: this.db.prepare(
        'INSERT INTO proposals (cycle_id, ts, fact, reason, action_tool, action_level, undo, confidence, verdict, executed, brain, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
      insLlm: this.db.prepare(
        'INSERT INTO llm_calls (ts, provider, model, ok, fail_type, prompt_tokens, completion_tokens, ms, free, cost_cny) VALUES (?,?,?,?,?,?,?,?,?,?)'),
      insLesson: this.db.prepare(
        'INSERT INTO lessons (ts, kind, text) VALUES (?,?,?)'),
      insSample: this.db.prepare(
        'INSERT INTO samples (cycle_id, ts, cpu, mem, disk_free_min) VALUES (?,?,?,?,?)'),
    };
  }

  beginCycle(trigger) {
    const r = this.st.insCycle.run(new Date().toISOString(), String(trigger || 'auto').slice(0, 16));
    return Number(r.lastInsertRowid);
  }
  endCycle(id, d) {
    this.st.endCycle.run(
      d.durationMs | 0, d.signals | 0, d.proposals | 0, d.toasts | 0,
      d.llmCalls | 0, d.degraded ? 1 : 0, String(d.note || '').slice(0, 200), id);
  }
  addEvent(cycleId, e, suppressed) {
    this.st.insEvent.run(cycleId, new Date().toISOString(),
      String(e.source || '').slice(0, 40), String(e.type || '').slice(0, 40),
      String(e.value ?? '').slice(0, 160), String(e.priority || 'normal').slice(0, 10),
      suppressed ? 1 : 0);
  }
  addProposal(cycleId, p) {
    this.st.insProp.run(cycleId, new Date().toISOString(),
      String(p.fact || '').slice(0, 300), String(p.reason || '').slice(0, 300),
      String(p.actionTool || '').slice(0, 40), p.actionLevel | 0,
      String(p.undo || '').slice(0, 120), String(p.confidence || '').slice(0, 10),
      String(p.verdict || '').slice(0, 32), p.executed ? 1 : 0,
      String(p.brain || '').slice(0, 60), String(p.note || '').slice(0, 200));
  }
  addLlmCall(c) {
    this.st.insLlm.run(new Date().toISOString(), String(c.provider || '').slice(0, 24),
      String(c.model || '').slice(0, 60), c.ok ? 1 : 0, String(c.failType || '').slice(0, 24),
      c.promptTokens | 0, c.completionTokens | 0, c.ms | 0, c.free ? 1 : 0, Number(c.costCny || 0));
  }
  addLesson(kind, text) {
    this.st.insLesson.run(new Date().toISOString(), String(kind).slice(0, 24), String(text).slice(0, 300));
  }
  addSample(cycleId, s) {
    this.st.insSample.run(cycleId, new Date().toISOString(),
      Number(s.cpu) || 0, Number(s.mem) || 0, Number(s.diskFreeMin) || 0);
  }
  recentSamples(n = 12) {
    return this.db.prepare(
      'SELECT * FROM samples ORDER BY id DESC LIMIT ?').all(n).reverse();
  }
  /* 本地自然日统计 (干活刻度) */
  dayFrom() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00`;
  }
  todayStats() {
    const from = this.dayFrom();
    const g = (sql, ...a) => { try { return Number(this.db.prepare(sql).get(...a).n) || 0; } catch { return 0; } };
    return {
      cycles: g(`SELECT COUNT(*) AS n FROM cycles WHERE started_at >= ?`, from),
      events: g(`SELECT COUNT(*) AS n FROM events_log WHERE ts >= ?`, from),
      proposals: g(`SELECT COUNT(*) AS n FROM proposals WHERE ts >= ?`, from),
      proposalsExecuted: g(`SELECT COUNT(*) AS n FROM proposals WHERE ts >= ? AND executed=1`, from),
      toasts: g(`SELECT COUNT(*) AS n FROM proposals WHERE ts >= ? AND verdict='ALLOW' AND action_level=1`, from),
      llmCalls: g(`SELECT COUNT(*) AS n FROM llm_calls WHERE ts >= ? AND ok=1`, from),
      llmFree: g(`SELECT COUNT(*) AS n FROM llm_calls WHERE ts >= ? AND ok=1 AND free=1`, from),
      lessons: g(`SELECT COUNT(*) AS n FROM lessons WHERE ts >= ?`, from),
    };
  }

  /* 打扰预算/降频: 以本机自然日统计 */
  toastsToday() {
    const day = new Date(); const from = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T00:00:00`;
    const r = this.db.prepare(
      `SELECT COUNT(*) AS n FROM proposals WHERE verdict='ALLOW' AND action_level=1 AND ts >= ?`).get(from);
    return Number(r.n) || 0;
  }
  sameFactToday(factKey) {
    const day = new Date(); const from = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T00:00:00`;
    const r = this.db.prepare(
      `SELECT COUNT(*) AS n FROM proposals WHERE ts >= ? AND note LIKE ?`).get(from, `%${factKey}%`);
    return Number(r.n) || 0;
  }
  llmCallsToday() {
    const day = new Date(); const from = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T00:00:00`;
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM llm_calls WHERE ts >= ? AND ok=1`).get(from);
    return Number(r.n) || 0;
  }
  paidCostToday() {
    const day = new Date(); const from = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T00:00:00`;
    const r = this.db.prepare(`SELECT COALESCE(SUM(cost_cny),0) AS s FROM llm_calls WHERE ts >= ?`).get(from);
    return Number(r.s) || 0;
  }

  recentProposals(n = 8) {
    return this.db.prepare(
      'SELECT * FROM proposals ORDER BY id DESC LIMIT ?').all(n);
  }
  lastProposalId() {
    const r = this.db.prepare('SELECT MAX(id) AS id FROM proposals').get();
    return Number(r && r.id) || 0;
  }
  recentCycles(n = 8) {
    return this.db.prepare(
      'SELECT * FROM cycles ORDER BY id DESC LIMIT ?').all(n);
  }
  counts() {
    const g = (sql) => { try { return Number(this.db.prepare(sql).get().n) || 0; } catch { return 0; } };
    return {
      cycles: g('SELECT COUNT(*) AS n FROM cycles'),
      events: g('SELECT COUNT(*) AS n FROM events_log'),
      proposals: g('SELECT COUNT(*) AS n FROM proposals'),
      llmCalls: g('SELECT COUNT(*) AS n FROM llm_calls'),
      lessons: g('SELECT COUNT(*) AS n FROM lessons'),
    };
  }
  close() { try { this.db.close(); } catch { /* 已关则忽略 */ } }
}

module.exports = { Memory };
