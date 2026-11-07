// poll-reruns.cjs — 重跑监控轮询(只读)
const http = require('node:http');
function get(p) {
  return new Promise((res, rej) => {
    http.get('http://127.0.0.1:17456' + p, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => res(b));
    }).on('error', rej);
  });
}
async function snap() {
  const out = [];
  for (const [tag, pid] of [['R1', 'od-dtw-rerun-r1'], ['R2', 'od-dtw-rerun-r2']]) {
    try {
      const d = JSON.parse(await get('/api/projects/' + pid + '/conversations'));
      const c = (d.conversations || [])[0] || {};
      const st = c.latestRun ? c.latestRun.status : 'none';
      out.push(tag + ': ' + st + ' msgs=' + c.messageCount);
    } catch (e) { out.push(tag + ': poll-err ' + e.message); }
  }
  console.log('[' + new Date().toLocaleTimeString() + '] ' + out.join('  |  '));
  return out;
}
(async () => {
  const rounds = Number(process.argv[2] || 4);
  for (let i = 0; i < rounds; i++) {
    await snap();
    if (i < rounds - 1) await new Promise((r) => setTimeout(r, 45000));
  }
})();
