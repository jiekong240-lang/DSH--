// patch-panel3.cjs — 面板红线执行:着色语义 + 统计口径 + 未验证存档区
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/panel.html';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

// ① 着色语义: passed=正常色, unverified=灰(不计入问题), failed=红(不变)
const colOld = "const colors={failed:'#ff6c85',passed:'#5bd3b2',pending:'#f4ca73',checking:'#f4ca73',unknown:'#9aaabd',uncovered:'#697b8c'};";
const colNew = "const colors={failed:'#ff5c78',passed:'#8fb8c9',pending:'#f4ca73',checking:'#f4ca73',unknown:'#7d8f9a',unverified:'#5a6b76',uncovered:'#5a6b76'};";
if (s.includes(colOld)) { s = s.replace(colOld, colNew); n++; console.log('colors: 红线语义 applied'); } else console.log('colors: ANCHOR MISSING');

// ② 标签: unverified = 未验证(不计入问题)
const labOld = "uncovered:'未覆盖'};";
const labNew = "uncovered:'未验证(不计入问题)',unverified:'未验证(不计入问题)'};";
if (s.includes(labOld)) { s = s.replace(labOld, labNew); n++; console.log('labels: applied'); } else console.log('labels: ANCHOR MISSING');

// ③ 统计口径: 失败只计真实 failed;未验证单独灰字
const cntOld = "$('counts').textContent=`失败 ${files.filter(f=>f.status==='failed').length} · 待验 ${files.filter(f=>['pending','checking'].includes(f.status)).length} · 文件 ${files.length}`;";
const cntNew = "const uv=state.unverified||[];$('counts').textContent=`失败 ${files.filter(f=>f.status==='failed').length} · 通过 ${files.filter(f=>f.status==='passed').length} · 未验证 ${uv.length}(红线:不计入问题) · 文件 ${files.length}`;";
if (s.includes(cntOld)) { s = s.replace(cntOld, cntNew); n++; console.log('counts: applied'); } else console.log('counts: ANCHOR MISSING');

// ④ 未验证存档区(灰, 勾选“显示已通过及未验证”时展开)
const lstOld = "$('list').append(row);}if(!list.length)$('list').textContent='当前筛选没有已报告问题；不代表业务功能或未覆盖文件通过。';";
const lstNew = "$('list').append(row);}if(!list.length)$('list').textContent='当前筛选没有已报告问题；不代表业务功能或未覆盖文件通过。';\n" +
  " const uv=state.unverified||[];const sep=document.createElement('div');sep.style.cssText='color:#5a6b76;font-size:11px;margin:8px 0 2px';sep.textContent='── 未验证 UNVERIFIED(红线:不计入问题)'+(uv.length?' '+uv.length+' 项':'')+' ──';$('list').append(sep);\n" +
  " if($('all').checked)uv.slice(0,40).forEach(x=>{const r=document.createElement('div');r.className='row unverified';r.textContent='◌ '+x.rel+' — '+(x.reason||'未验证');$('list').append(r);});";
if (s.includes(lstOld)) { s = s.replace(lstOld, lstNew); n++; console.log('unverified block: applied'); } else console.log('unverified: ANCHOR MISSING');

fs.writeFileSync(f, s);
console.log('done, changes:', n, '| size:', s.length);
console.log('verify:', s.includes('不计入问题'), '| unverified key:', s.includes('state.unverified'));
