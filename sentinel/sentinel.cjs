'use strict';
/* ============================================================
 * 哨兵 · 决策循环 (手册§6: 每个事件走同一条流程, 不得跳步)
 *   1接收 2感知(指标/探活/模型池/趋势) 3紧急旁路(固定规则)
 *   4请示大脑 5生成提案 6过闸门 7执行或记录 8回写(记忆+审计+大屏)
 *
 * 形态阶梯 (config.mode):
 *   shadow — L1+ 只记录 (手册 P1)
 *   assist — L1 提醒真亮, 预算/静默守门; L2 白名单可执行(每日报告);
 *            L3 仅 restart_dsh 有执行器, 须经大屏批准(一次性, 5分钟)。
 * 能力: 模型池配额情报 / 磁盘趋势预警 / 每日干活报告 / DSH 自愈。
 * ============================================================ */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Audit } = require('./audit.cjs');
const { Memory } = require('./memory.cjs');
const { Brain } = require('./brain.cjs');
const { Perception } = require('./perception.cjs');
const gate = require('./gate.cjs');

const ROOT = __dirname;
const PROJECT = path.join(ROOT, '..');

function quietNow(cfg) {
  const [qs_, qe] = cfg.quietHours || ['23:00', '08:00'];
  const [qh, qm] = qs_.split(':').map(Number);
  const [eh, em] = qe.split(':').map(Number);
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  const a = qh * 60 + qm, b = eh * 60 + em;
  return a <= b ? (mins >= a && mins < b) : (mins >= a || mins < b);
}

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class Sentinel {
  constructor() {
    this.cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    this.audit = new Audit(path.join(ROOT, '..', 'logs'));
    this.memory = new Memory(path.join(ROOT, 'state'));
    this.brain = new Brain(this.cfg, this.audit);
    this.perception = new Perception(this.cfg);
    this.deps = {};
    this.timer = null;
    this.running = false;
    this.startedAt = null;
    this.lastCycle = null;
    this.nextRunAt = 0;
    this.cycles = 0;
    this.state = 'INIT';
    this.mode = this.cfg.mode === 'assist' ? 'assist' : 'shadow';
    this.grants = gate.grantsFromConfig(this.cfg.grants, PROJECT);
    this.writeWhitelist = [...this.grants]
      .filter((g) => g.startsWith('write_file:'))
      .map((g) => g.slice('write_file:'.length));
    this.prevDown = new Set();      // 上一轮探活失败的服务
    this.pendingApproval = null;    // {proposalId, tool, fact, ts}
    this.reportDone = '';           // 空=启动后首个到达报告时刻的轮次即写(当日重复触发会覆盖, 内容幂等)
    this.dshUrl = null;             // 最近一次自愈拿到的 DSH 地址
    this.lastSnapshot = null;
  }

  init(deps) {
    this.deps = deps || {};
    this.startedAt = Date.now();
    this.state = this.mode === 'assist' ? 'ASSIST_WATCH' : 'SHADOW_WATCH';
    const ms = Math.max(30, this.cfg.intervalSec || 180) * 1000;
    this.timer = setInterval(() => { this.runCycle('auto').catch(() => {}); }, ms);
    this.audit.write('boot', { intervalSec: this.cfg.intervalSec, mode: this.mode, watchers: this.perception.watchers.length, grants: [...this.grants] });
    /* 启动后 8s 先跑一轮, 让大屏立即有数据 */
    setTimeout(() => { this.runCycle('boot').catch(() => {}); }, 8000);
    return this;
  }

  ctx(extra = {}) {
    const toasts = this.memory.toastsToday();
    return {
      mode: this.mode,
      grants: this.grants,
      writeWhitelist: this.writeWhitelist,
      humanConfirmed: false,
      approved: false,
      quietNow: quietNow(this.cfg),
      toastLeft: Math.max(0, (this.cfg.dailyToastBudget || 20) - toasts),
      emitToast: (msg, urgent) => { try { this.deps.toast && this.deps.toast(msg, urgent); } catch { /* 忽略 */ } },
      ...extra,
    };
  }

  /* 大屏活动流上屏 (复用 server 的事件通道) */
  pushActivity(tool, target, status, kind = 'task') {
    try {
      this.deps.pushEvent && this.deps.pushEvent({
        ts: Date.now(), source: 'sentinel', kind, tool,
        target: String(target || '').slice(0, 120), status: status || 'ok',
      });
    } catch { /* 忽略 */ }
  }

  /* ============ 能力: 模型池/趋势事件 ============ */
  capabilityEvents(snap) {
    const evs = [];
    const pool = snap.pool;
    if (pool) {
      const total = (pool.cooling || []).length;
      const degradedN = this.cfg.pool && this.cfg.pool.degradedCooling || 6;
      if (total > 0 && this.prevPoolCooling !== total) { /* 状态变化才报 */
        evs.push({ id: 'pool', time: new Date().toISOString(), source: 'ladder', type: total >= degradedN ? 'pool_exhausted' : 'pool_degraded', value: `${total} 档冷却中`, context: { cooling: pool.cooling.slice(0, 4), todayFails: pool.today }, priority: 'normal' });
      }
      this.prevPoolCooling = total;
    }
    const trend = snap.trend;
    if (trend && trend.slopePerHour < -0.3 && trend.projected24h < (this.cfg.thresholds.diskFreePct || 8) + 8) {
      const key = `trend:${Math.round(trend.projected24h)}`;
      if (this.prevTrendKey !== key) {
        evs.push({ id: 'trend', time: new Date().toISOString(), source: 'history', type: 'disk_trend_low', value: `磁盘剩余趋势 ${trend.slopePerHour}%/h, 24h 预测 ${trend.projected24h}%`, context: trend, priority: 'normal' });
      }
      this.prevTrendKey = key;
    }
    return evs;
  }

  /* ============ 能力: L3 一次性批准 ============ */
  requestApproval(proposalId, tool, fact) {
    this.pendingApproval = { proposalId, tool, fact, ts: Date.now() };
    this.audit.write('approval_requested', { proposalId, tool, ttlMs: this.cfg.restartDsh.approvalTtlMs });
    try { this.deps.onState && this.deps.onState(this.publicState()); } catch { /* 忽略 */ }
  }

  approve(proposalId) {
    const p = this.pendingApproval;
    if (!p || Number(proposalId) !== p.proposalId) {
      return { ok: false, error: '无此待批提案' };
    }
    if (Date.now() - p.ts > (this.cfg.restartDsh.approvalTtlMs || 300000)) {
      this.pendingApproval = null;
      this.audit.write('approval', { proposalId, verdict: 'EXPIRED' });
      return { ok: false, error: '批准已过期(5 分钟), 等下一轮提案' };
    }
    this.pendingApproval = null;
    this.audit.write('approval', { proposalId, tool: p.tool, verdict: 'GRANTED_ONETIME' });
    /* 立即执行该一次性动作 */
    const r = gate.execute(p.tool, { proposalId }, this.ctx({ humanConfirmed: true, approved: true }));
    this.audit.write('l3_execute', { tool: p.tool, gate: r.verdict, executed: r.executed });
    if (r.executed && r.output === 'delegate:doRestartDsh') {
      this.doRestartDsh(p.proposalId);
      return { ok: true, tool: p.tool, note: '已执行一次性批准动作' };
    }
    return { ok: r.executed, tool: p.tool, verdict: r.verdict, reason: r.reason };
  }

  /* ============ 能力: DSH 自愈 (launch-dsh.js keeper + 新 token URL 上屏) ============ */
  doRestartDsh(proposalId) {
    const cfgR = this.cfg.restartDsh || {};
    const logFile = path.join(PROJECT, cfgR.logDir || 'logs', `dsh-restart-${Date.now()}.log`);
    this.pushActivity('sentinel-l3', `DSH 自愈重启已触发 (提案 #${proposalId})`, 'ok', 'exec');
    try {
      const out = fs.openSync(logFile, 'a');
      const child = spawn(process.execPath, [path.join(PROJECT, cfgR.launcher || 'launch-dsh.js'), '--no-open'], {
        cwd: PROJECT, detached: true, stdio: ['ignore', out, out],
      });
      child.unref();
    } catch (e) {
      this.audit.write('restart_dsh_error', { error: String(e && e.message || e).slice(0, 160) });
      return;
    }
    this.audit.write('restart_dsh', { proposalId, log: logFile.replace(/\\/g, '/') });
    /* 轮询启动日志提取新 token URL (token 每次启动轮换) */
    const waitMs = cfgR.tokenWaitMs || 45000;
    const started = Date.now();
    const timer = setInterval(() => {
      let url = null;
      try {
        const txt = fs.readFileSync(logFile, 'utf8');
        const m = txt.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/);
        if (m) url = m[0];
      } catch { /* 日志尚未写出 */ }
      if (url) {
        clearInterval(timer);
        this.dshUrl = url;
        this.audit.write('restart_dsh_ready', { url });
        this.ctx().emitToast(`✅ DSH 已自愈重启 · 新地址: ${url}`, true);
        this.pushActivity('sentinel-l3', 'DSH 自愈完成, 新 token 地址已上屏', 'ok', 'task');
        try { this.deps.onState && this.deps.onState(this.publicState()); } catch { /* 忽略 */ }
      } else if (Date.now() - started > waitMs) {
        clearInterval(timer);
        this.ctx().emitToast('⚠ DSH 重启已触发但未见 token, 请看 logs/dsh-restart-*.log', true);
        this.audit.write('restart_dsh_timeout', { waitMs });
      }
    }, 2000);
  }

  /* ============ 能力: 每日干活报告 (L2 白名单写, 真实常驻资产) ============ */
  dailyReport() {
    const day = localDay();
    if (this.reportDone === day) return;
    const hour = new Date().getHours();
    if (hour < ((this.cfg.report || {}).atHour ?? 8)) return;
    const st = this.memory.todayStats();
    const pool = this.lastSnapshot && this.lastSnapshot.pool;
    const props = this.memory.recentProposals(10);
    const lines = [
      `# 哨兵日报 ${day}`,
      '',
      `- 模式: ${this.mode} · 巡查周期 ${this.cfg.intervalSec}s · 每日打扰预算 ${this.cfg.dailyToastBudget}`,
      `- 今日轮次: ${st.cycles} · 事件 ${st.events} · 提案 ${st.proposals} (执行 ${st.proposalsExecuted}) · 提醒 ${st.toasts}`,
      `- 大脑调用: ${st.llmCalls} 次 (免费档 ${st.llmFree}, 花费 ¥0) · 教训入库 ${st.lessons}`,
      `- 模型池: ${pool ? `冷却 ${pool.cooling.length} 档 · 当日失败 ${pool.today.total} (QUOTA ${pool.today.quota} / RATE ${pool.today.rateLimit})` : '无情报'}`,
      '',
      '## 最近提案',
      ...(props.length ? props.map((p) => `- [${String(p.ts).slice(11, 19)}] ${p.fact} → L${p.action_level} ${p.action_tool} · 闸门 ${p.verdict} · ${p.executed ? '已执行' : '仅记录'}`) : ['- (无)']),
      '',
      '## 教训 (lessons)',
      ...(this.memory.db.prepare('SELECT * FROM lessons ORDER BY id DESC LIMIT 5').all().map((l) => `- ${l.ts} [${l.kind}] ${l.text}`)),
      '',
      `_由哨兵自动生成于 ${new Date().toISOString()} · 逐笔审计见 logs/sentinel-audit.jsonl_`,
    ];
    const dirRel = (this.cfg.report || {}).dir || 'monitor-records/sentinel-reports';
    const ctx = this.ctx();
    const r = gate.execute('write_file', {
      target: path.join(PROJECT, dirRel, `${day}.md`).replace(/\\/g, '/'),
      content: lines.join('\n'),
    }, ctx);
    this.audit.write('daily_report', { day, gate: r.verdict, executed: r.executed, target: r.output });
    if (r.executed) {
      this.reportDone = day;
      this.pushActivity('sentinel-report', `每日报告已生成 ${day}.md`, 'ok', 'task');
    }
  }

  async runCycle(trigger = 'auto') {
    if (this.running) return { skipped: true, reason: 'cycle in progress' };
    this.running = true;
    const started = Date.now();
    const cycleId = this.memory.beginCycle(trigger);
    let signals = 0, proposals = 0, toasts = 0, llmCalls = 0, degraded = 0;
    const notes = [];
    try {
      /* 1-2 接收 + 感知 (全部 L0 只读, 已过闸门语义) + 能力情报 */
      const snap = await this.perception.collect(this.deps.collectMetrics || (() => null));
      snap.pool = this.perception.poolStatus();
      if (snap.metrics) {
        this.memory.addSample(cycleId, {
          cpu: snap.metrics.cpu.avgPct, mem: snap.metrics.mem.pct,
          diskFreeMin: Math.min(...snap.metrics.disks.map((d) => (d.totalGB > 0 ? 100 - d.pct : 100))),
        });
      }
      snap.trend = Perception.trendFrom(this.memory.recentSamples(12));
      this.lastSnapshot = { pool: snap.pool, trend: snap.trend, at: started };
      signals = snap.events.length;
      for (const e of snap.events) this.memory.addEvent(cycleId, e, false);

      /* 能力事件 (池/趋势, 自带去重) */
      for (const e of this.capabilityEvents(snap)) {
        snap.events.push(e);
        this.memory.addEvent(cycleId, e, false);
        signals++;
      }
      if (snap.suppressed) this.audit.write('dedupe', { suppressed: snap.suppressed });

      /* 3 紧急旁路: 固定规则直接通知, 不等待大脑 (手册§5-3; 仍过闸门)。
       * 旁路是平台级规则而非智能体动作, 故按 assist 语义放行 L1 ——
       * 任何模式下紧急事件都必须能上屏, 只受静默豁免(此处显式豁免)。 */
      const urgent = snap.events.filter((e) => e.priority === 'urgent');
      for (const e of urgent) {
        const msg = `⚠ ${e.type} · ${e.value}`;
        const r = gate.execute('dashboard_toast', { message: msg, urgent: true }, { ...this.ctx(), mode: 'assist', quietNow: false });
        if (r.executed) { toasts++; }
        this.audit.write('urgent_bypass', { event: e, gate: r.verdict, reason: r.reason });
        this.memory.addProposal(cycleId, {
          fact: `${e.type}: ${e.value}`, reason: '紧急旁路固定规则(不等待模型)',
          actionTool: 'dashboard_toast', actionLevel: 1, undo: '无需撤销(仅提醒)',
          confidence: 'high', verdict: r.executed ? 'ALLOW' : r.verdict, executed: r.executed,
          brain: 'fixed-rule', note: r.reason,
        });
        proposals++;
      }

      /* 能力: DSH 连续 2 轮探活失败 → L3 自愈提案 (等人工批准, 不自动执行) */
      const downNow = new Set((snap.probes || []).filter(([n, p]) => !p.up && n === 'dsh').map(([n]) => n));
      if (downNow.has('dsh') && this.prevDown.has('dsh')) {
        const fact = 'DSH 服务连续 2 轮探活失败 (3080 无响应)';
        const r = gate.execute('restart_dsh', {}, this.ctx()); // 无批准 → 必拦
        this.memory.addProposal(cycleId, {
          fact, reason: '连续 2 轮探活失败, 触发自愈提案 (须人工批准)',
          actionTool: 'restart_dsh', actionLevel: 3, undo: '重启前 DSH 本就不可用, 风险低',
          confidence: 'high', verdict: r.verdict, executed: false,
          brain: 'fixed-rule', note: `${r.reason} · 可在大屏批准`,
        });
        proposals++;
        this.requestApproval(this.memory.lastProposalId(), 'restart_dsh', fact);
      }
      this.prevDown = downNow;

      /* 判断是否介入: 无事件则安静轮 (零调用, 花费纪律) */
      const normalEvents = snap.events.filter((e) => e.priority !== 'urgent');
      if (!snap.events.length) {
        notes.push('quiet: 无异常信号, 未调用大脑');
      } else if (normalEvents.length) {
        /* 4 请示大脑 (免费升梯; 内容最小化, 含模型池/趋势情报) */
        const userContent = JSON.stringify({
          now: new Date().toISOString(),
          mode: this.mode,
          metrics: snap.metrics ? {
            cpu: snap.metrics.cpu.avgPct, mem: snap.metrics.mem.pct,
            diskMinFreePct: Math.min(...snap.metrics.disks.map((d) => 100 - d.pct)),
          } : null,
          probes: Object.fromEntries((snap.probes || []).map(([n, p]) => [n, p.up ? 'up' : `down(${p.status})`])),
          pool: snap.pool ? { cooling: snap.pool.cooling.length, todayFails: snap.pool.today.total } : null,
          trend: snap.trend || null,
          events: normalEvents.map((e) => ({ source: e.source, type: e.type, value: e.value, context: e.context })),
        });
        const ask = await this.brain.ask(userContent);
        llmCalls += ask.calls.length;
        for (const c of ask.calls) this.memory.addLlmCall(c);
        degraded = ask.ok ? 0 : 1;

        if (ask.ok) {
          const v = ask.verdict;
          if (v.verdict === 'QUIET') {
            notes.push(`brain: QUIET(${v.note})`);
          } else if (v.verdict === 'INJECTION') {
            this.memory.addLesson('injection', `感知内容含注入特征, 已拦截: ${v.note}`);
            this.audit.write('injection_blocked', { note: v.note, events: normalEvents.length });
            this.pushActivity('sentinel-gate', '提示注入拦截 INJECTION BLOCKED', 'blocked', 'error');
            notes.push(`brain: INJECTION 拦截(${v.note})`);
          } else {
            /* 5-7 生成提案 -> 过闸门 -> 执行或记录 */
            const factKey = v.fact.slice(0, 40);
            const repeat = this.memory.sameFactToday(factKey);
            const r = gate.execute(v.action.tool, { ...v.action, message: `哨兵: ${v.fact}`, target: factKey }, this.ctx());
            this.memory.addProposal(cycleId, {
              fact: v.fact, reason: v.reason, actionTool: v.action.tool, actionLevel: v.action.level,
              undo: v.undo, confidence: v.confidence,
              verdict: r.verdict, executed: r.executed,
              brain: `${ask.calls[0].provider}/${ask.calls[0].model}`,
              note: `${r.reason}${v.advice ? ' · 建议: ' + v.advice : ''}`,
            });
            proposals++;
            if (r.executed) toasts++;
            if (repeat >= 3) this.audit.write('downgrade', { factKey, reason: '同类提案今日已3次, 自动降级只记录' });
            this.audit.write('proposal', { fact: v.fact, tool: v.action.tool, level: v.action.level, gate: r.verdict, executed: r.executed, advice: v.advice });
            this.pushActivity('sentinel-proposal', v.fact, r.executed ? 'ok' : 'record', 'task');
          }
        } else {
          /* 降级方案: 大脑不可达 -> 固定规则出提案, 只记录 (综述§8降级) */
          for (const e of normalEvents.slice(0, 2)) {
            this.memory.addProposal(cycleId, {
              fact: `${e.type}: ${e.value}`, reason: '规则引擎降级提案(大脑不可达)',
              actionTool: 'notify', actionLevel: 1, undo: '无需撤销(仅提醒)',
              confidence: 'low', verdict: 'RECORD_ONLY', executed: false,
              brain: 'rule-fallback', note: '降级: 只记录',
            });
            proposals++;
          }
          notes.push('degraded: 大脑不可达, 固定规则接管');
          this.audit.write('degraded', { events: normalEvents.length });
        }
      } else {
        notes.push('urgent-only: 仅紧急事件, 走旁路');
      }

      /* 能力: 每日报告 */
      try { this.dailyReport(); } catch (e) { this.audit.write('daily_report_error', { error: String(e && e.message || e).slice(0, 120) }); }

      this.cycles++;
      this.lastCycle = { id: cycleId, at: started, signals, proposals, toasts, llmCalls, degraded, notes };
      this.memory.endCycle(cycleId, {
        durationMs: Date.now() - started, signals, proposals, toasts, llmCalls, degraded,
        note: notes.join(' | ').slice(0, 200),
      });
      this.audit.write('cycle_end', { id: cycleId, trigger, ms: Date.now() - started, signals, proposals, toasts, llmCalls, degraded, notes });
      this.nextRunAt = Date.now() + (this.cfg.intervalSec || 180) * 1000;
      this.state = degraded ? 'DEGRADED_RULES' : (this.mode === 'assist' ? 'ASSIST_WATCH' : 'SHADOW_WATCH');
      try { this.deps.onState && this.deps.onState(this.publicState()); } catch { /* 忽略 */ }
      return { ok: true, id: cycleId, signals, proposals, llmCalls, degraded };
    } catch (e) {
      this.audit.write('cycle_error', { error: String(e && e.message || e).slice(0, 200) });
      this.memory.endCycle(cycleId, { durationMs: Date.now() - started, signals, proposals, toasts, llmCalls, degraded: 1, note: 'cycle_error' });
      this.state = 'ERROR';
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      this.running = false;
    }
  }

  publicState() {
    const c = this.memory.counts();
    return {
      state: this.state,
      mode: this.mode,
      shadowMode: this.mode === 'shadow',
      intervalSec: this.cfg.intervalSec,
      startedAt: this.startedAt,
      cycles: this.cycles,
      nextRunAt: this.nextRunAt,
      quiet: quietNow(this.cfg),
      budget: { toastToday: this.memory.toastsToday(), toastLimit: this.cfg.dailyToastBudget, toastLeft: Math.max(0, (this.cfg.dailyToastBudget || 20) - this.memory.toastsToday()) },
      brain: { llmToday: this.memory.llmCallsToday(), llmTotal: c.llmCalls, paidCostToday: this.memory.paidCostToday(), lastGood: this.brain.lastGood ? `${this.brain.lastGood.provider}/${this.brain.lastGood.model}` : null },
      dbCounts: c,
      lastCycle: this.lastCycle,
      recentProposals: this.memory.recentProposals(6),
      recentCycles: this.memory.recentCycles(6),
      pendingApproval: this.pendingApproval && {
        proposalId: this.pendingApproval.proposalId, tool: this.pendingApproval.tool,
        fact: this.pendingApproval.fact, expiresInSec: Math.max(0, Math.round(((this.cfg.restartDsh.approvalTtlMs || 300000) - (Date.now() - this.pendingApproval.ts)) / 1000)),
      },
      dshUrl: this.dshUrl,
      lastSnapshot: this.lastSnapshot,
      gateLevels: gate.LEVELS,
    };
  }

  manualRun() { return this.runCycle('manual'); }
  stop() { if (this.timer) clearInterval(this.timer); this.state = 'STOPPED'; }
}

module.exports = { Sentinel };
