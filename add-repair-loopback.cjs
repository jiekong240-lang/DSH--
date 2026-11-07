// add-repair-loopback.cjs — 给 /repair 加回环直通(与 /roots 同款信任模型)
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/index.js';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

const anchor = " // 回环只读快照旁路(2026-10-31):供本机监视/自动化核验,不出回环";
if (s.includes("base+'/repair'&&req.method==='POST'){const ra=")) {
  console.log('repair loopback: already present');
} else if (s.includes(anchor)) {
  const inject = " // 红色修复直通(2026-10-31):仅限本机回环的运维/自动化调用\n" +
    " if(u.pathname===base+'/repair'&&req.method==='POST'){const ra=(req.socket&&req.socket.remoteAddress||'').replace('::ffff:','');if(ra!=='127.0.0.1'&&ra!=='::1'){res.writeHead(403);res.end('loopback only');return;}const rid=u.searchParams.get('id')||'';try{const run=repairs.start(rid);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,run}));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:String(e.message)}));}return;}\n" + anchor;
  s = s.replace(anchor, inject);
  n++;
  console.log('repair loopback: inserted');
} else console.log('ANCHOR MISSING');
fs.writeFileSync(f, s);
console.log('done, changes:', n, '| has repair-loopback:', s.includes('base+\'/repair\'&&req.method===\'POST\'){const ra='));
