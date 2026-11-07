// e2e-collect.cjs — 采集 E2E 验证证据(只读)
const fs = require('node:fs');
const L = fs.readFileSync('C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log', 'utf8').trim().split('\n');
const mark = '2026-10-31T04:42';
const evs = L.filter((l) => l.slice(0, 20) >= mark).map((l) => {
  try { return JSON.parse(l.slice(24)); } catch { return null; }
}).filter(Boolean);
const rel = evs.filter((e) => ['smart_start', 'rotate', 'saw', 'exhaust', 'paid_switch'].includes(e.ev));
console.log('=== 本次窗口梯子事件:', rel.length, '===');
rel.forEach((e) => console.log(' ', e.ev.padEnd(12), (e.code || '').padEnd(11), String(e.from || '').slice(0, 45), '->', String(e.to || '').slice(0, 45), 'score:', e.score ?? '-', 'rung:', e.rung ?? '-'));
console.log('=== 产物 ===');
for (const f of ['t1-ok.txt', 'config-e2e.js', 'TESTING.md', 'package.json', 'twin-check.txt']) {
  const p = 'C:/Users/64562/dsh-e2e-verify/' + f;
  console.log(' ', f, fs.existsSync(p) ? 'EXISTS ' + Math.round(fs.statSync(p).size / 102.4) / 10 + 'KB' : 'MISSING');
}
const d3 = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/sessions';
const sess = fs.existsSync(d3) ? fs.readdirSync(d3).filter((x) => !x.startsWith('--')).length : 0;
console.log('sandbox-home sessions(非默认家):', sess);
