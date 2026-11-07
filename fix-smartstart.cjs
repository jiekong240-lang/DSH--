// fix-smartstart.cjs — 修复智能起步的调用层缺陷 + 读取健康记忆
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/free-ladder/index.js';
let s = fs.readFileSync(f, 'utf8');

// ① 展示当前 smart-start 块
const si = s.indexOf('const want = this.startRungFor(sid);');
console.log('=== 当前 smart-start 调用块 ===');
console.log(s.slice(si - 60, si + 320));

// ② 修复:调用方不再提前放弃(startRungFor 内部已做“向上找最近就绪档”扫描)
const oldA = 'if (want > rung && this.isRungReady(want)) {';
const newA = 'if (want > rung) {';
if (s.includes(oldA)) {
  s = s.replace(oldA, newA);
  fs.writeFileSync(f, s);
  console.log('\n✅ caller pre-check removed — 冷却档不再导致直接落梯底');
} else if (s.includes(newA)) {
  console.log('\n already fixed');
} else {
  console.log('\n❌ ANCHOR NOT FOUND');
}

// ③ 健康记忆读取
try {
  const d = JSON.parse(fs.readFileSync('C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder-health.json', 'utf8'));
  console.log('\n=== 健康记忆 ===');
  for (const [k, v] of Object.entries(d)) {
    console.log(' ', k.slice(0, 58), '| 冷却至:', v.cooldownUntil ? new Date(v.cooldownUntil).toLocaleString() : '-', '| fails:', JSON.stringify(v.fails || {}));
  }
} catch (e) { console.log('health: ', e.message); }
