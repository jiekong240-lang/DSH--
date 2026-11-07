'use strict';
/* ============================================================
 * 哨兵 · 权限闸门 (手册§3/§8 + 综述§7设计要点2)
 * 原则只有一条: 安全靠本机代码强制, 不靠提示词劝说。
 * 默认拒绝; 未登记的工具一律拦下交人; L3 一律等人工确认。
 *
 * 模式 (config.mode, 手册§10 形态阶梯):
 *   shadow — L1 及以上一律只记录 (P1 影子)
 *   assist — L1 提醒真亮, 但仍受静默时段+每日预算约束 (P2 提醒与建议)
 * L2/L3 在任何模式下都须逐项授权 / 人工批准。
 * ============================================================ */

/* 工具登记表: 名称 -> 权限级别 L0-L3 (手册附录A思路) */
const LEVELS = {
  record: 0,            // 写入记忆/审计 (本机数据, 无副作用)
  collect_metrics: 0,   // 读取本机指标 (只读)
  probe_service: 0,     // 探活本地服务 (只读)
  read_state: 0,        // 读取哨兵自身状态 (只读)
  dashboard_toast: 1,   // 向大屏发提醒 (只是消息, 可忽略)
  notify: 1,            // 向用户发提醒 (同上)
  write_file: 2,        // 可逆写入 (须白名单, 默认无授权)
  run_command: 3,       // 执行命令 (红线: 每次必须人工确认)
  restart_service: 3,   // 重启服务 (红线: 同上)
  restart_dsh: 3,       // 重启 DSH (唯一装配了执行器的 L3: 须大屏批准, 5分钟有效, 一次性)
  unlock_schedule: 3,   // 修改系统计划任务 (红线: 无执行器)
};

function decide(tool, arg, ctx) {
  const level = Object.prototype.hasOwnProperty.call(LEVELS, tool)
    ? LEVELS[tool]
    : null;
  if (level === null) {
    return { verdict: 'BLOCKED_UNREGISTERED', level: null, reason: '未登记的工具一律拒绝' };
  }
  if (level >= 3) {
    if (!ctx.humanConfirmed) {
      return { verdict: 'BLOCKED_L3_NEEDS_HUMAN', level, reason: '红线: L3 敏感操作必须每次人工确认' };
    }
    /* 人是最终决策者(手册§1); 但执行器是否存在由代码决定 */
    return { verdict: 'ALLOW', level, reason: 'L3 已获人工批准(一次性), 交执行器' };
  }
  const shadow = (ctx.mode || 'shadow') === 'shadow';
  if (shadow && level >= 1) {
    return { verdict: 'RECORD_ONLY', level, reason: `影子模式: L${level} 动作只记录不执行` };
  }
  if (level === 0) return { verdict: 'ALLOW', level, reason: 'L0 只读' };
  if (level === 1) {
    if (ctx.quietNow) return { verdict: 'RECORD_ONLY', level, reason: '静默时段: 只记录不提醒' };
    if (ctx.toastLeft <= 0) {
      return { verdict: 'RECORD_ONLY', level, reason: '超出每日打扰预算: 只记录不提醒' };
    }
    return { verdict: 'ALLOW', level, reason: 'L1 提醒在预算内 (assist 模式)' };
  }
  if (level === 2) {
    /* 前缀授权: 授权目录覆盖其下全部目标 (手册"按设备×动作逐项授权") */
    const t = String(arg && arg.target || '').replace(/\\/g, '/');
    const prefix = `${tool}:`;
    const ok = [...(ctx.grants || [])].some((g) => {
      if (!g.startsWith(prefix)) return false;
      const granted = g.slice(prefix.length);
      return t === granted || t.startsWith(granted.endsWith('/') ? granted : granted + '/');
    });
    if (ok) return { verdict: 'ALLOW', level, reason: 'L2 目标在已授权白名单内' };
    return { verdict: 'BLOCKED_NEEDS_GRANT', level, reason: 'L2 须逐项授权, 默认拒绝' };
  }
  return { verdict: 'BLOCKED_NEEDS_HUMAN', level, reason: '未知级别, 默认交人' };
}

/* 执行体: 代码层只实现 L0/L1 + 白名单 L2 + 唯一的 L3(restart_dsh, 须 ctx.approved)。
 * 其余 L2/L3 没有实现 = 最强的闸门。 */
function execute(tool, arg, ctx) {
  const d = decide(tool, arg, ctx);
  if (d.verdict !== 'ALLOW') {
    return { executed: false, verdict: d.verdict, reason: d.reason, output: null };
  }
  switch (tool) {
    case 'record':
    case 'collect_metrics':
    case 'probe_service':
    case 'read_state':
      return { executed: true, verdict: 'ALLOW', reason: d.reason, output: null };
    case 'dashboard_toast':
    case 'notify':
      if (typeof ctx.emitToast === 'function') ctx.emitToast(String(arg && arg.message || '').slice(0, 140), !!arg.urgent);
      return { executed: true, verdict: 'ALLOW', reason: d.reason, output: 'toast' };
    case 'write_file': {
      /* 双保险: 闸门授权(前缀白名单) + 执行器再验一次(路径+扩展名+大小) */
      const target = String(arg && arg.target || '');
      const wl = ctx.writeWhitelist || [];
      const hit = wl.find((p) => target.replace(/\\/g, '/').startsWith(p));
      if (!hit || !target.endsWith('.md')) {
        return { executed: false, verdict: 'BLOCKED_WHITELIST', reason: '目标不在写白名单(仅限报告目录 .md)', output: null };
      }
      if (String(arg.content || '').length > 65536) {
        return { executed: false, verdict: 'BLOCKED_SIZE', reason: '写入内容超 64KB', output: null };
      }
      try {
        require('fs').mkdirSync(hit, { recursive: true });
        require('fs').writeFileSync(require('path').join(hit, require('path').basename(target)), String(arg.content), 'utf8');
        return { executed: true, verdict: 'ALLOW', reason: d.reason, output: target };
      } catch (e) {
        return { executed: false, verdict: 'WRITE_ERROR', reason: String(e && e.message || e).slice(0, 120), output: null };
      }
    }
    case 'restart_dsh':
      /* L3 唯一执行器: 必须带 ctx.approved=true(由 approve() 消费一次性批准后设置)。
       * 实际重启动作在 sentinel.cjs doRestartDsh() 中执行(需要 spawn/日志/广播能力)。 */
      if (!ctx.approved) {
        return { executed: false, verdict: 'BLOCKED_APPROVAL', reason: '缺少一次性批准令牌', output: null };
      }
      return { executed: true, verdict: 'ALLOW', reason: d.reason, output: 'delegate:doRestartDsh' };
    default:
      /* run_command / restart_service / unlock_schedule: 无执行器 */
      return { executed: false, verdict: 'NOT_IMPLEMENTED', reason: '该工具在代码层不存在执行器', output: null };
  }
}

/* 由 config.grants 构造 L2 授权集: {write_file: ["dir"]} -> Set("write_file:dir") */
function grantsFromConfig(grantsCfg, baseDir) {
  const path = require('path');
  const set = new Set();
  for (const [tool, list] of Object.entries(grantsCfg || {})) {
    if (tool.startsWith('_')) continue; /* _comment 等说明键不是授权 */
    for (const item of list || []) {
      const abs = path.isAbsolute(item) ? item : path.join(baseDir, item);
      set.add(`${tool}:${abs.replace(/\\/g, '/')}`);
    }
  }
  return set;
}

module.exports = { LEVELS, decide, execute, grantsFromConfig };
