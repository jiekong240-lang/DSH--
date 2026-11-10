'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function launchMcp(env) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp-server.js')], {
    env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let bufferedErrors = '';
  child.stderr.on('data', data => { bufferedErrors += String(data); });
  const output = readline.createInterface({ input: child.stdout });
  output.on('line', line => {
    try {
      const event = JSON.parse(line);
      const handler = pending.get(event.id);
      if (handler) { pending.delete(event.id); handler.resolve(event); }
    } catch (error) {
      for (const p of pending.values()) p.reject(new Error('Invalid MCP output: ' + line));
      pending.clear();
    }
  });
  function call(id, method, params) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('MCP_TIMED_OUT ' + method + ' ' + bufferedErrors));
      }, 20000);
      pending.set(id, {
        resolve: reply => { clearTimeout(timer); resolve(reply); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  return { child, call };
}

test('real MCP subprocess repairs code via fake local DeepSeek and real Node check', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-mcp-'));
  let modelServer, client;
  try {
    await fs.writeFile(path.join(project, 'app.js'), 'module.exports = () => 1;\n');
    await fs.writeFile(path.join(project, 'check.cjs'), "if (require('./app')() !== 2) process.exit(1);\n");
    modelServer = http.createServer((request, response) => {
      const payload = {
        choices: [{ message: { content: JSON.stringify({
          path: 'app.js', oldText: '=> 1', newText: '=> 2', reason: 'repair'
        }) } }],
      };
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(payload));
    });
    await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve));
    const port = modelServer.address().port;
    client = launchMcp({ DEEPSEEK_API_KEY: 'test-only', DEEPSEEK_BASE_URL: 'http://127.0.0.1:' + port });

    const init = await client.call(1, 'initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.result.serverInfo.name, 'dsh-cua-coding');
    const tools = await client.call(2, 'tools/list', {});
    assert.equal(tools.result.tools[0].name, 'cua_coding_repair');
    const invalid = await client.call(3, 'tools/call', { name: 'cua_coding_repair', arguments: { goal: 'fix' } });
    assert.equal(invalid.error.code, -32602);
    const response = await client.call(4, 'tools/call', {
      name: 'cua_coding_repair',
      arguments: {
        project, goal: 'Make checker pass',
        verifyCommand: [process.execPath, 'check.cjs'], maxRounds: 2,
      }
    });
    assert.equal(response.result.isError, false);
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.changedPaths, ['app.js']);
    assert.equal((await fs.readFile(path.join(project, 'app.js'), 'utf8')).includes('=> 2'), true);
    const report = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
    assert.equal(report.baseline.ok, false);
    assert.equal(report.rounds[0].verification.ok, true);
  } finally {
    if (client) {
      const closed = new Promise(resolve => client.child.once('close', resolve));
      client.child.stdin.end();
      await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 5000))]);
      if (client.child.exitCode === null) client.child.kill();
    }
    if (modelServer) await new Promise(resolve => modelServer.close(resolve));
    await fs.rm(project, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
  }
});
