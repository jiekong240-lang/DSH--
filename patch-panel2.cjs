// patch-panel2.cjs — 面板:外部测试结果展示区(自动采集,非手动)
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/panel.html';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

// ① HTML: 列表上方加“DSH 测试结果”展示区
if (!s.includes('extList')) {
  s = s.replace('<div id="list"></div>', '<div id="extWrap"><small id="extHead">DSH 测试结果 TEST RESULTS(自动采集)</small><div id="extList"></div></div><div id="list"></div>');
  n++; console.log('HTML extWrap: inserted');
} else console.log('HTML extWrap: already');

// ② JS: render() 里渲染 externalTests
const anchor = "$('test-result').textContent=run?run.status+(run.stale?' · 源码已变化，结果过期':'')+'\\n'+run.output:'尚未运行项目测试';";
const inject = anchor + "\n const ext=state.externalTests||[];const extBox=$('extList');extBox.replaceChildren();if(!ext.length){const e0=document.createElement('div');e0.style.cssText='color:#9faebd;font-size:12px';e0.textContent='暂无 — DSH 在会话里跑过 node 测试后,真实结果自动出现在这里';extBox.append(e0);}ext.slice(0,5).forEach(x=>{const r=document.createElement('div');r.className='row '+(x.status==='passed'?'passed':'failed');r.textContent=(x.status==='passed'?'✅ ':'❌ ')+x.file+' · '+(new Date(x.at).toLocaleTimeString())+' · '+(x.output||'').slice(-140).replace(/\\n/g,' ');extBox.append(r);});";
if (s.includes(anchor)) { s = s.replace(anchor, inject); n++; console.log('JS render: inserted'); }
else console.log('JS render: ANCHOR NOT FOUND');

fs.writeFileSync(f, s);
console.log('done, changes:', n, '| size:', s.length);
console.log('verify extList:', s.includes('extList'), '| externalTests:', s.includes('externalTests'));
