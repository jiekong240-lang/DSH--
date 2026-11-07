// patch-panel.cjs — 给 live-code 面板加“自动聚焦最近活动根 + 手动优先”
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/panel.html';
let s = fs.readFileSync(f, 'utf8');
let changed = 0;

// ① onchange 记录手动切换时间
const old1 = "$('root').onchange=()=>{selected=null;render();};";
const new1 = "$('root').onchange=()=>{selected=null;$('root').manualAt=Date.now();render();};";
if (s.includes(old1)) { s = s.replace(old1, new1); changed++; console.log('onchange: added manualAt'); }
else if (s.includes('manualAt')) console.log('onchange: already has manualAt');
else console.log('onchange: PATTERN NOT FOUND');

// ② 每次轮询: 自动聚焦“最近有文件活动的根”(手动切换后 10 秒内尊重手动)
const anchor = 'selected=null;}';
if (s.includes('自动聚焦')) { console.log('auto-focus: already present'); }
else if (s.includes(anchor)) {
  const inject = 'selected=null;}\n' +
    " // 自动聚焦:默认显示最近有文件活动的根(手动切换后 10 秒内尊重手动)\n" +
    " let latestR=-1,latestT=-1;(state.files||[]).forEach(f=>{const tt=f.changedAt||0;if(tt>latestT){latestT=tt;latestR=f.r;}});\n" +
    " if(latestR>=0&&String(latestR)!==$('root').value&&Date.now()-($('root').manualAt||0)>10000){$('root').value=String(latestR);selected=null;render();}";
  const at = s.indexOf(anchor);
  s = s.slice(0, at) + inject + s.slice(at + anchor.length);
  changed++;
  console.log('auto-focus: inserted');
}
fs.writeFileSync(f, s);
console.log('done, changes:', changed, '| size:', s.length);
