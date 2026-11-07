'use strict';
/**
 * 经验学习
 * 
 * CORE - 首要核心，勿删除
 * 每一次正确的 CUA 运行都用 API 总结经验
 * 
 * TRACE 2026-11-08: 初始实现
 * - 收集成功迹迹
 * - 准备给外部 API 的总结请求
 * - 本地存储经验摘要
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const EXPERIENCE_FILE = path.join(__dirname, '..', 'state', 'experience.jsonl');
const EXPERIENCE_DIR = path.join(__dirname, '..', 'state', 'experience');

function ensureDir() {
  if (!fs.existsSync(EXPERIENCE_DIR)) fs.mkdirSync(EXPERIENCE_DIR, { recursive: true });
  const parent = path.dirname(EXPERIENCE_FILE);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
}

function appendLocal(entry) {
  try {
    ensureDir();
    fs.appendFileSync(EXPERIENCE_FILE, JSON.stringify({ ts: Date.now(), ...entry }) + '\n');
  } catch (e) {
    console.error('[experience] local append failed:', e.message);
  }
}

/**
 * 准备给 API 的载荷
 * 调用方需提供 endpoint 与 apiKey（或从环境变量读取）
 */
function buildSummaryPayload(trace) {
  return {
    taskId: trace.taskId,
    goal: trace.goal,
    steps: trace.steps || [],
    result: trace.result || {},
    observationSummary: trace.observationSummary,
    success: true,
    ts: Date.now(),
  };
}

/**
 * 调用外部 API 总结经验
 * 默认从环境变量读取 CUA_EXPERIENCE_API
 */
async function summarizeViaApi(trace, options = {}) {
  const endpoint = options.endpoint || process.env.CUA_EXPERIENCE_API;
  if (!endpoint) {
    appendLocal({ type: 'summary_skipped', reason: 'no endpoint', trace });
    return { ok: false, reason: 'no CUA_EXPERIENCE_API configured' };
  }

  const payload = buildSummaryPayload(trace);
  const body = JSON.stringify({
    model: options.model || 'experience-summarizer',
    messages: [
      {
        role: 'system',
        content: '你是 CUA 经验总结器。根据成功运行迹迹，用简短中文总结可复用的操作经验与注意事项。',
      },
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ],
  });

  return new Promise((resolve) => {
    const url = new URL(endpoint);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          appendLocal({
            type: 'api_summary',
            ok,
            status: res.statusCode,
            payload,
            response: data.slice(0, 500),
          });
          resolve({ ok, status: res.statusCode, response: data.slice(0, 500) });
        });
      }
    );
    req.on('error', (e) => {
      appendLocal({ type: 'api_error', error: e.message, payload });
      resolve({ ok: false, error: e.message });
    });
    req.write(body);
    req.end();
  });
}

/**
 * 在成功运行后调用
 */
async function onSuccessfulRun(trace, options) {
  appendLocal({ type: 'success_trace', trace });
  return summarizeViaApi(trace, options);
}

module.exports = {
  onSuccessfulRun,
  summarizeViaApi,
  buildSummaryPayload,
  appendLocal,
};
