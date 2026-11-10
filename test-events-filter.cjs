'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const PORT = 3999;

async function startServer(dir) {
  const child = spawn(process.execPath, [path.join(dir, 'server.js')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SENTINEL_DISABLE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      let settled = false, output = '';
      const timeout = setTimeout(() => finish(new Error('SERVER_START_TIMEOUT: ' + output.slice(-700))), 15000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve();
      }
      child.once('error', finish);
      child.once('exit', code => finish(new Error('SERVER_EXIT_' + code + ': ' + output.slice(-700))));
      child.stdout.on('data', buf => {
        output += String(buf);
        if (output.includes('DATA SERVICE ONLINE')) finish();
      });
      child.stderr.on('data', buf => { output += String(buf); });
    });
  } catch (error) { child.kill(); throw error; }
  return child;
}
async function request(route, method = 'GET', body) {
  const resp = await fetch('http://127.0.0.1:' + PORT + route, {
    method, signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await resp.text();
  return { status: resp.status, body: text ? JSON.parse(text) : null };
}
async function apiChecks() {
  for (const e of [{ ts: 0, kind: 'code', source: 'zero' },
    { ts: 1000, kind: 'exec', source: 'middle' }, { ts: 2000, kind: 'task', source: 'late' }]) {
    assert.equal((await request('/api/event', 'POST', e)).status, 204);
  }
  const zero = await request('/api/events?from=0&to=0');
  assert.deepEqual(zero.body.events.map(e => e.ts), [0]);
  assert.equal(zero.body.filteredCounts.code, 1);
  assert.equal(zero.body.filteredCounts.exec, 0);
  const range = await request('/api/events?from=0&to=1000');
  assert.deepEqual(range.body.events.map(e => e.ts), [0, 1000]);
  assert.equal(range.body.filteredCounts.exec, 1);
  assert.equal(range.body.counts.task, 1);
  for (const url of ['/api/events?from=abc', '/api/events?to=xyz',
    '/api/events?from=&to=1', '/api/events?from=2&to=1']) {
    assert.equal((await request(url)).status, 400, url);
  }
  assert.equal((await request('/api/event', 'POST', { ts: 'bad' })).status, 400);
  assert.equal((await request('/api/events')).body.events.length, 3);
}
async function browserChecks() {
  const source = await fs.readFile(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const a = source.indexOf('/* ---------------- 事件范围过滤 ---------------- */');
  const b = source.indexOf("$('filterBtn').addEventListener('click', applyEventFilter);", a);
  assert.ok(a !== -1 && b > a);
  const fields = new Map(Object.entries({
    filterFrom: { value: 'bad' }, filterTo: { value: '' },
    feedList: { innerHTML: '' }, cntCode: {}, cntExec: {}, cntScan: {}, cntErr: {}
  }));
  let calls = 0;
  const alerts = [];
  const context = {
    $: id => fields.get(id), URLSearchParams, Promise, Number, String, Date,
    console, KIND_ICON: {}, activity: { list: [] },
    alert: text => alerts.push(text),
    esc: text => String(text || ''),
    pad: n => String(n).padStart(2, '0'),
    fetch: async url => {
      calls++;
      const res = await request(url);
      return { ok: res.status === 200, status: res.status, json: async () => res.body };
    }
  };
  vm.runInNewContext(source.slice(a, b), context, { filename: 'app.js/filter' });
  assert.equal(await vm.runInNewContext('applyEventFilter()', context), false);
  assert.equal(calls, 0);
  assert.equal(alerts.length, 1);
  fields.get('filterFrom').value = '0';
  fields.get('filterTo').value = '0';
  assert.equal(await vm.runInNewContext('applyEventFilter()', context), true);
  assert.equal(context.activity.list.length, 1);
  assert.equal(context.activity.list[0].ts, 0);
  assert.equal(fields.get('cntCode').textContent, 1);
  assert.equal(fields.get('cntExec').textContent, 0);
  assert.ok(fields.get('feedList').innerHTML.includes('zero'));
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-monitor-test-'));
  let child;
  try {
    await fs.copyFile(path.join(__dirname, 'server.js'), path.join(dir, 'server.js'));
    child = await startServer(dir);
    await apiChecks();
    await browserChecks();
    console.log('PASS: API zero timestamp, ranges, counts, actual browser filter');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error('FAIL:', e.stack || e); process.exitCode = 1; });
