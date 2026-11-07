#!/usr/bin/env node
/* ============================================================
 * dsh-hook.js — ZCode hooks -> 数字孪生大屏 桥接脚本
 *
 * 由 ~/.zcode/cli/config.json 的 hooks 调用:
 *   node dsh-hook.js <kind>     kind: code|exec|scan|tool|error|task|idle|session
 *
 * 设计原则:
 *   - 立即派生 detached 子进程上报, 本进程毫秒级退出, 不拖慢智能体
 *   - stdin 的 hook JSON 尽力解析(字段名多方案兼容), 解析不出也照样上报
 *   - stdout 保持空 / exit 0 (hook 输出会被当 JSON 校验)
 *   - 大屏没开时连接秒拒, 静默丢弃
 * ============================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ENDPOINT = process.env.DSH_MONITOR_ENDPOINT || 'http://127.0.0.1:3210/api/event';

/* ---- 子进程模式: 真正发 POST ---- */
if (process.argv[2] === '_send') {
  try {
    const file = process.argv[3];
    const body = fs.readFileSync(file, 'utf8');
    fs.unlink(file, () => {});
    const u = new URL(ENDPOINT);
    const mod = require(u.protocol === 'https:' ? 'https' : 'http');
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 1500,
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch { /* 上报失败永不影响主流程 */ }
  const t = setTimeout(() => process.exit(0), 1800);
  if (t.unref) t.unref(); // POST 正常收尾即退出, 不白等 1.8s
  return void 0;
}

/* ---- 主模式: 收集 stdin -> 派生 _send -> 立即退出 ---- */
function guessKind(tool) {
  const t = String(tool);
  if (/^(Edit|Write|MultiEdit|NotebookEdit|ApplyPatch)/.test(t)) return 'code';
  if (/^(Bash|PowerShell|Shell|Terminal|Execute)/.test(t)) return 'exec';
  if (/^(Read|Grep|Glob|List|Search|Find)/.test(t)) return 'scan';
  return 'tool';
}

/* 从工具入参提取真实代码变更 (Edit 的 old/new_string, Write 的 content) */
function extractDiff(kind, tool, input) {
  try {
    if (kind !== 'code' || !input || typeof input !== 'object') return null;
    if (/MultiEdit/i.test(tool) && Array.isArray(input.edits) && input.edits.length) {
      const e0 = input.edits[0] || {};
      return { del: String(e0.old_string || '').slice(0, 800), ins: String(e0.new_string || '').slice(0, 800) };
    }
    if (input.old_string !== undefined || input.new_string !== undefined) {
      return { del: String(input.old_string || '').slice(0, 800), ins: String(input.new_string || '').slice(0, 800) };
    }
    if (input.content !== undefined) {
      return { del: '', ins: String(input.content).slice(0, 800) };
    }
    return null;
  } catch { return null; }
}

function send() {
  clearTimeout(timer);
  let data = {};
  try { data = JSON.parse(raw || '{}') || {}; } catch { /* stdin 不是 JSON 也继续 */ }
  const tool = data.tool_name || data.tool || data.name || '';
  const input = data.tool_input || data.input || data.arguments || {};
  const targetRaw = input.file_path || input.notebook_path || input.path || input.pattern
    || input.command || input.url || input.query || data.prompt || '';
  const kind = process.argv[2] || guessKind(tool);
  const ev = {
    ts: Date.now(),
    host: os.hostname(),
    source: 'ZCODE',
    kind,
    tool: String(tool || kind).slice(0, 40),
    target: String(targetRaw).slice(0, 140),
    status: kind === 'error' ? 'error' : 'ok',
    session: String(process.env.CLAUDE_SESSION_ID || process.env.ZCODE_SESSION_ID || '').slice(0, 40),
    cwd: String(data.cwd || process.env.CLAUDE_CWD || process.env.ZCODE_CWD || '').slice(0, 200),
    diff: extractDiff(kind, tool, input),
  };
  try {
    /* 唯一文件名: 并发工具调用不会互相覆盖 payload */
    const pf = path.join(os.tmpdir(), 'dsh-monitor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.json');
    fs.writeFileSync(pf, JSON.stringify(ev));
    const child = spawn(process.execPath, [__filename, '_send', pf], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
  } catch { /* 派生失败静默 */ }
  process.exit(0);
}

let raw = '';
const timer = setTimeout(send, 400);
try {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', send);
  process.stdin.on('error', send);
} catch { send(); }
