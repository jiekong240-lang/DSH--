// patch-monitor.cjs — 监视器:转发 DSH 会话里的 node 测试结果到 live-code 面板
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/.dsh/plugins/dsh-monitor/index.js';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

// ① Config: 测试结果端点
const cOld = "    liveCodeEndpoint: z.string().default('http://127.0.0.1:3080/dsh-live-code/roots'),";
const cNew = cOld + "\n    /** live-code 面板的测试结果接收端点(本机回环)—— DSH 跑过的测试自动上屏 */\n    liveCodeTestEndpoint: z.string().default('http://127.0.0.1:3080/dsh-live-code/test-external'),";
if (s.includes(cOld) && !s.includes('liveCodeTestEndpoint')) { s = s.replace(cOld, cNew); n++; console.log('config: added'); }
else console.log('config: ' + (s.includes('liveCodeTestEndpoint') ? 'already' : 'ANCHOR MISSING'));

// ② constructor: 会话事件监听(测试结果转发)
const ctorOld = "    ctx.inject(['tools'], (scope) => {\n      scope.tools.guard((exec) => this.observe(exec));\n    });\n  }";
const ctorNew = `    ctx.inject(['tools'], (scope) => {
      scope.tools.guard((exec) => this.observe(exec));
    });
    /** 会话事件:转发 DSH 跑过的 node 测试结果到 live-code 面板(fire-and-forget, fail-open) */
    this.calls = new Map();
    ctx.on?.('session/event', (p1, p2) => {
      try {
        const session = (p1 && p1.session) ? p1.session : p1;
        const event = (p1 && p1.event) ? p1.event : p2;
        if (!session || !event) return;
        const d = event.data || {};
        if (event.type === 'tool/call') {
          let cmd = '';
          try { const a = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : (d.arguments || {}); cmd = String(a.command || a.cmd || ''); } catch { cmd = ''; }
          if (d.callId) { this.calls.set(d.callId, { name: d.name, cmd: cmd.slice(0, 300) }); if (this.calls.size > 200) { const fk = this.calls.keys().next().value; this.calls.delete(fk); } }
          return;
        }
        if (event.type !== 'tool/result') return;
        const callId = (d.message && d.message.source && d.message.source.callId) || d.toolCallId || '';
        const call = this.calls.get(callId) || {};
        const cmd = call.cmd || '';
        const text = (d.message && Array.isArray(d.message.content)) ? d.message.content.map((c) => (c && c.text) || '').join('\\n') : '';
        const isTest = /--test|\\btest-[\\w.-]+\\.c?js|\\.(test|spec)\\.[cm]?js/i.test(cmd);
        const hasSummary = /# pass \\d|# fail \\d|✅|✔|pass \\d+/i.test(text);
        if (!isTest && !hasSummary) return;
        const status = /# fail [1-9]|✖|not ok/i.test(text) ? 'failed' : /# pass \\d+|✔|passed/i.test(text) ? 'passed' : 'unknown';
        const fileM = cmd.match(/([\\w./\\\\-]+\\.(?:test|spec)\\.[cm]?js|test-[\\w.-]+\\.c?js)/i);
        const body = JSON.stringify({
          file: fileM ? fileM[1] : cmd.slice(0, 60),
          status, output: text.slice(-800), command: cmd.slice(0, 200), at: Date.now(),
        });
        const u = new URL(this.config.liveCodeTestEndpoint);
        const rq = http.request({
          hostname: u.hostname, port: u.port || 80, path: u.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-dsh-live-source': 'monitor' },
          timeout: 1000,
        });
        rq.on('error', () => {});
        rq.on('timeout', () => rq.destroy());
        rq.end(body);
      } catch { /* 静默 */ }
    });
  }`;
if (s.includes(ctorOld) && !s.includes('session/event')) { s = s.replace(ctorOld, ctorNew); n++; console.log('listener: added'); }
else console.log('listener: ' + (s.includes('session/event') ? 'already present' : 'CTOR ANCHOR MISSING'));

fs.writeFileSync(f, s);
console.log('done, changes:', n, '| size:', s.length);
