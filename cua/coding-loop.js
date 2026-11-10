'use strict';
// DeepSeek coding loop: inspect real code, make one precise change, run a real
// owner-chosen verification command, feed real errors back and retry.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const SKIP = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'coverage', 'logs', 'state', '.cua-coding-runs']);
const EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.md', '.css', '.html', '.yml', '.yaml']);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value) || /^[a-z]:/i.test(value)) throw new Error('INVALID_PATH');
  const parts = value.replace(/\\/g, '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || SKIP.has(p) || p.startsWith('.'))) throw new Error('INVALID_PATH');
  if (!EXT.has(path.extname(value).toLowerCase())) throw new Error('UNSUPPORTED_FILE_TYPE');
  return parts.join('/');
}

async function existingSource(project, value) {
  const rel = relativeFile(value);
  const root = await fsp.realpath(project);
  const candidate = path.join(root, rel);
  const real = await fsp.realpath(candidate);
  if (!real.startsWith(root + path.sep)) throw new Error('OUTSIDE_PROJECT');
  const stat = await fsp.stat(real);
  if (!stat.isFile() || stat.size > 120000) throw new Error('FILE_TOO_LARGE');
  return { rel, real };
}

async function inventory(project, cap = 60) {
  const files = [];
  async function walk(dir, depth) {
    if (depth > 5) return;
    const items = (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      if (files.length >= cap) return;
      if (item.isSymbolicLink() || item.name.startsWith('.') || SKIP.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await walk(full, depth + 1);
      else if (item.isFile() && EXT.has(path.extname(item.name))) {
        if ((await fsp.stat(full)).size <= 120000) files.push(path.relative(project, full).replace(/\\/g, '/'));
      }
    }
  }
  await walk(project, 0);
  return files;
}

async function deepseek(messages, config = {}) {
  const key = config.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY_REQUIRED');
  const url = String(config.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const response = await fetch(url + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0, response_format: { type: 'json_object' }, messages
    }),
  });
  if (!response.ok) throw new Error('DEEPSEEK_HTTP_' + response.status);
  const json = await response.json();
  const raw = json.choices?.[0]?.message?.content;
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BAD_MODEL_RESPONSE');
  return value;
}

async function runCommand(project, args, options = {}) {
  if (!Array.isArray(args) || !args.length || !args.every(a => typeof a === 'string')) throw new Error('VERIFY_COMMAND_REQUIRED');
  return new Promise(resolve => {
    const child = spawn(args[0], args.slice(1), { cwd: project, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, settled = false;
    child.stdout.on('data', d => { stdout = (stdout + String(d)).slice(-14000); });
    child.stderr.on('data', d => { stderr = (stderr + String(d)).slice(-14000); });
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, Math.min(Number(options.timeoutMs) || 60000, 300000));
    const finish = (code, error) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      resolve({ ok: code === 0 && !timedOut && !error, code, timedOut, stdout, stderr, error: error ? error.message : null });
    };
    child.on('error', e => finish(null, e));
    child.on('close', code => finish(code, null));
  });
}

async function report(dir, state) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'RESULT.json'), tmp = dest + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await fsp.rename(tmp, dest);
}

async function runCodingLoop(options) {
  const project = await fsp.realpath(path.resolve(options.project));
  const goal = String(options.goal || '').trim();
  const verifyCommand = options.verifyCommand;
  if (!goal) throw new Error('GOAL_REQUIRED');
  if (!Array.isArray(verifyCommand) || !verifyCommand.length) throw new Error('VERIFY_COMMAND_REQUIRED');
  const model = options.model || deepseek;
  const runner = options.runner || runCommand;
  const maxRounds = Math.min(Math.max(Number(options.maxRounds) || 3, 1), 8);
  const reportDir = path.resolve(options.reportDir || path.join(project, '.cua-coding-runs', 'latest'));
  const files = await inventory(project);
  if (!files.length) throw new Error('NO_SOURCE_FILES');
  const state = { project, goal, verifyCommand, status: 'running', rounds: [], startedAt: new Date().toISOString() };
  const baseline = await runner(project, verifyCommand, options);
  state.baseline = baseline;
  await report(reportDir, state);
  let lastResult = baseline;
  const touched = new Set();

  for (let index = 0; index < maxRounds; index++) {
    const sources = [];
    for (const file of files.slice(0, 35)) {
      try {
        const { real, rel } = await existingSource(project, file);
        const content = await fsp.readFile(real, 'utf8');
        if (content.length < 9000) sources.push({ path: rel, content, sha256: sha(content) });
      } catch { /* do not infer unseen contents */ }
      if (JSON.stringify(sources).length > 60000) break;
    }
    const patch = await model([
      { role: 'system', content: 'You are a coding agent. Return one JSON object with path, oldText, newText, reason. Only replace one exact existing source substring. Do not change tests or verification. Do not claim success. Do not output shell commands.' },
      { role: 'user', content: JSON.stringify({ goal, files: sources, round: index + 1, inventory: files, previousVerification: lastResult, verificationCommand: verifyCommand }) }
    ], options.modelConfig);
    const turn = { index: index + 1, path: patch?.path || null, reason: patch?.reason || '' };
    try {
      if (typeof patch.oldText !== 'string' || !patch.oldText || typeof patch.newText !== 'string' || patch.newText.length > 30000) throw new Error('INVALID_PATCH');
      const { rel, real } = await existingSource(project, patch.path);
      if (!files.includes(rel)) throw new Error('UNKNOWN_FILE');
      if (/(\.test|\.spec)\.[cm]?js$/.test(rel)) throw new Error('TEST_EDIT_REFUSED');
      const before = await fsp.readFile(real, 'utf8');
      const count = before.split(patch.oldText).length - 1;
      if (count !== 1) throw new Error('PATCH_MATCH_COUNT_' + count);
      const after = before.replace(patch.oldText, patch.newText);
      if (before === after) throw new Error('NO_CHANGE');
      await fsp.writeFile(real, after, 'utf8');
      touched.add(rel);
      turn.changed = { path: rel, beforeSha: sha(before), afterSha: sha(after) };
      lastResult = await runner(project, verifyCommand, options);
      turn.verification = lastResult;
      turn.outcome = lastResult.ok === true ? 'verified' : 'failed';
      state.rounds.push(turn);
      await report(reportDir, state);
      if (lastResult.ok === true) {
        state.status = 'verified';
        state.changedPaths = [...touched];
        state.completedAt = new Date().toISOString();
        await report(reportDir, state);
        return state;
      }
    } catch (error) {
      turn.outcome = 'blocked';
      turn.error = String(error.message || error);
      state.rounds.push(turn);
      break;
    }
  }
  state.status = 'not-verified';
  state.changedPaths = [...touched];
  state.completedAt = new Date().toISOString();
  await report(reportDir, state);
  return state;
}

module.exports = { runCodingLoop, deepseek, runCommand, relativeFile };
