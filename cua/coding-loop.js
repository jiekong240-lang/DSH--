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

function isVerificationArtifact(rel, command = []) {
  const filename = path.posix.basename(rel).toLowerCase();
  const directory = rel.toLowerCase().split('/');
  if (directory.some(x => /^(?:test|tests|__tests__|spec|specs|testkit|fixture|fixtures|e2e)$/i.test(x))) return true;
  if (/(?:^|[._-])(?:test|spec|check|verify|assert|fixture|jest|vitest|mocha|playwright|eslint|prettier)(?:[._-]|$)/i.test(filename)) return true;
  if (/^(?:package|tsconfig|jsconfig|pyproject|pytest|tox|jest|vitest|playwright|eslint|prettier|babel|vite|webpack|rollup|biome)(?:[.-]|$)/i.test(filename)) return true;
  return command.some(x => typeof x === 'string' &&
    x.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase() === rel.toLowerCase());
}

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
    let stdout = '', stderr = '', timedOut = false, settled = false, child, timer, fallback;
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(fallback);
      resolve({ ok: code === 0 && !error && !timedOut, code, timedOut,
        stdout, stderr, error: error ? String(error.message || error) : null });
    };
    try {
      child = spawn(args[0], args.slice(1), {
        cwd: project, shell: false, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) { finish(null, error); return; }
    child.stdout.on('data', d => { stdout = (stdout + String(d)).slice(-14000); });
    child.stderr.on('data', d => { stderr = (stderr + String(d)).slice(-14000); });
    child.once('error', e => finish(null, e));
    child.once('close', code => finish(code, null));
    timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { try { child.kill(); } catch {} });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch { try { child.kill('SIGKILL'); } catch {} }
      }
      fallback = setTimeout(() => finish(null, new Error('VERIFY_TIMEOUT')), 5000);
    }, Math.min(Math.max(Number(options.timeoutMs) || 60000, 100), 300000));
  });
}

async function report(dir, state) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'RESULT.json'), tmp = dest + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await fsp.rename(tmp, dest);
}

// Validate the whole model proposal before touching any source file.
// The legacy single-patch JSON contract remains supported.
async function preparePatchSet(project, proposal, inventoryFiles, verifyCommand) {
  const patches = Array.isArray(proposal?.patches) ? proposal.patches : [proposal];
  if (!patches.length || patches.length > 5) throw new Error('PATCH_SET_SIZE_INVALID');
  const prepared = [];
  const seen = new Set();
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') throw new Error('INVALID_PATCH');
    const op = patch.op || 'replace';
    if (!['replace', 'create'].includes(op)) throw new Error('INVALID_PATCH_OP');
    const rel = relativeFile(patch.path);
    if (seen.has(rel)) throw new Error('DUPLICATE_PATCH_PATH');
    if (isVerificationArtifact(rel, verifyCommand)) throw new Error('TEST_EDIT_REFUSED');
    seen.add(rel);
    if (op === 'create') {
      if (typeof patch.content !== 'string' || !patch.content || patch.content.length > 30000) {
        throw new Error('INVALID_CREATE_CONTENT');
      }
      const root = await fsp.realpath(project);
      const parent = await fsp.realpath(path.dirname(path.join(root, rel)));
      if (parent !== root && !parent.startsWith(root + path.sep)) throw new Error('OUTSIDE_PROJECT');
      const real = path.join(parent, path.basename(rel));
      try {
        await fsp.lstat(real);
        throw new Error('CREATE_TARGET_EXISTS');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      prepared.push({ op, rel, real, before: null, after: patch.content,
        beforeSha: null, afterSha: sha(patch.content) });
      continue;
    }
    if (typeof patch.oldText !== 'string' || !patch.oldText ||
        typeof patch.newText !== 'string' || patch.newText.length > 30000) {
      throw new Error('INVALID_PATCH');
    }
    const { real } = await existingSource(project, rel);
    if (!inventoryFiles.includes(rel)) throw new Error('UNKNOWN_FILE');
    const before = await fsp.readFile(real, 'utf8');
    const count = before.split(patch.oldText).length - 1;
    if (count !== 1) throw new Error('PATCH_MATCH_COUNT_' + count);
    const after = before.replace(patch.oldText, patch.newText);
    if (before === after) throw new Error('NO_CHANGE');
    prepared.push({ op, rel, real, before, after, beforeSha: sha(before), afterSha: sha(after) });
  }
  return prepared;
}

async function applyPatchSet(prepared) {
  // Stage all contents first. Publication is best-effort rollback, not crash-atomic.
  const staged = [], published = [];
  async function assertUnchanged(item) {
    if (item.op === 'create') {
      try {
        await fsp.lstat(item.real);
        throw new Error('CREATE_TARGET_EXISTS');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    } else if (await fsp.readFile(item.real, 'utf8') !== item.before) {
      throw new Error('SOURCE_CHANGED_CONCURRENTLY');
    }
  }
  try {
    for (const item of prepared) {
      await assertUnchanged(item);
      const temp = item.real + '.cua-stage-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
      await fsp.writeFile(temp, item.after, { flag: 'wx' });
      staged.push({ ...item, temp });
    }
    for (const item of staged) await assertUnchanged(item);
    for (const item of staged) {
      if (item.op === 'create') {
        // Exclusive destination creation: never overwrite an existing file.
        await fsp.copyFile(item.temp, item.real, fs.constants.COPYFILE_EXCL);
      } else {
        await fsp.rename(item.temp, item.real);
      }
      published.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of published.reverse()) {
      try {
        if (await fsp.readFile(item.real, 'utf8') === item.after) {
          if (item.op === 'create') await fsp.unlink(item.real);
          else await fsp.writeFile(item.real, item.before, 'utf8');
        } else rollbackErrors.push(item.rel + ':CONCURRENT_CHANGE');
      } catch (rollbackError) {
        rollbackErrors.push(item.rel + ':' + rollbackError.message);
      }
    }
    if (rollbackErrors.length) {
      throw new Error('PATCH_PUBLISH_FAILED_ROLLBACK_INCOMPLETE: ' + rollbackErrors.join(';'));
    }
    throw error;
  } finally {
    for (const item of staged) {
      await fsp.rm(item.temp, { force: true }).catch(() => {});
    }
  }
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
  if (baseline.ok === true) {
    state.status = 'baseline-passing';
    state.completedAt = new Date().toISOString();
    await report(reportDir, state);
    return state;
  }
  await report(reportDir, state);
  let lastResult = baseline;
  const touched = new Set();

  for (let index = 0; index < maxRounds; index++) {
    const currentFiles = await inventory(project);
    const sources = [];
    for (const file of currentFiles.slice(0, 35)) {
      try {
        const { real, rel } = await existingSource(project, file);
        const content = await fsp.readFile(real, 'utf8');
        if (content.length < 9000) sources.push({ path: rel, content, sha256: sha(content) });
      } catch { /* do not infer unseen contents */ }
      if (JSON.stringify(sources).length > 60000) break;
    }
    let patch;
    try {
      patch = await model([
      { role: 'system', content: 'You are a coding agent. Return JSON with either {path,oldText,newText,reason} for a legacy edit or {patches:[...],reason} with 1-5 operations: {op:'replace',path,oldText,newText} on existing files, or {op:'create',path,content} for a new source file in an existing directory. Every oldText must match exactly once. Never edit tests, fixtures, verifier, build configuration or verification command. Never claim success. No shell commands.' },
      { role: 'user', content: JSON.stringify({ goal, files: sources, round: index + 1, inventory: currentFiles, previousVerification: lastResult, verificationCommand: verifyCommand }) }
      ], options.modelConfig);
    } catch (error) {
      state.rounds.push({ index: index + 1, outcome: 'model-error', error: String(error.message || error) });
      break;
    }
    const turn = { index: index + 1, path: patch?.path || null, reason: patch?.reason || '' };
    try {
      const prepared = await preparePatchSet(project, patch, currentFiles, verifyCommand);
      await applyPatchSet(prepared);
      for (const item of prepared) touched.add(item.rel);
      turn.changed = prepared.length === 1
        ? { path: prepared[0].rel, beforeSha: prepared[0].beforeSha, afterSha: prepared[0].afterSha }
        : undefined;
      turn.changes = prepared.map(item => ({
        path: item.rel, beforeSha: item.beforeSha, afterSha: item.afterSha
      }));
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

module.exports = { runCodingLoop, deepseek, runCommand, relativeFile, isVerificationArtifact, preparePatchSet, applyPatchSet };
