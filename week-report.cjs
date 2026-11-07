// week-report.cjs — 本周变更与系统状态全景(只读)
const fs = require('node:fs');
const http = require('node:http');

function get(url) {
  return new Promise((res) => {
    http.get(url, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', (e) => res({ status: 0, body: String(e.message) }));
  });
}

(async () => {
  const out = [];
  const p = (s) => { out.push(s); };

  /* 服务 */
  const checks = [];
  for (const [name, url] of [['monitor :3210', 'http://127.0.0.1:3210/live.html'], ['DSH web :3080', 'http://127.0.0.1:3080/dsh-live-code/state'], ['od daemon :17456', 'http://127.0.0.1:17456/api/projects']]) {
    const r = await get(url);
    checks.push(name + ' ' + (r.status === 200 ? '✅' : r.status));
  }
  p('══ 服务 ══\n' + checks.join('\n'));

  /* 引擎 */
  try {
    const d = JSON.parse((await get('http://127.0.0.1:3080/dsh-live-code/state')).body);
    p('══ live-code 引擎 ══\nroots ' + d.roots.length + ' · files ' + (d.files || []).length + ' · unverified ' + (d.unverified || []).length + ' · seq ' + d.seq + ' · at ' + new Date(d.at).toLocaleString());
  } catch (e) { p('══ live-code 引擎 ══ 离线'); }

  /* 本周梯子活动 */
  try {
    const L = fs.readFileSync('C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/free-ladder.log', 'utf8').trim().split('\n');
    const week = L.filter((l) => l.slice(0, 20) >= '2026-11-01');
    const byEv = {};
    const smart = [];
    for (const l of week) {
      try {
        const e = JSON.parse(l.slice(24));
        byEv[e.ev] = (byEv[e.ev] || 0) + 1;
        if (e.ev === 'smart_start') smart.push('    score ' + e.score + ' → ' + e.to + ' (rung ' + e.rung + ') @ ' + l.slice(11, 19));
      } catch { }
    }
    p('══ 本周(11月)梯子事件: ' + week.length + ' ══\n' + Object.entries(byEv).sort((a, b) => b[1] - a[1]).map((x) => '  ' + x[0] + ' x' + x[1]).join('\n'));
    if (smart.length) p('  智能起步明细:\n' + smart.join('\n'));
  } catch (e) { p('══ 梯子日志读取失败: ' + e.message); }

  console.log(out.join('\n\n'));
})();
