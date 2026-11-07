// fix-branch.cjs — 修复被切断的 recheck/repair else-if 链
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/live-code/index.js';
let s = fs.readFileSync(f, 'utf8');

const broken = " else if(u.pathname===base+'/repair'&&req.method==='POST'&&req.headers['x-dsh-live']==='1')result=repairs.start(u.searchParams.get('id'));{const f=engine.files.get(u.searchParams.get('id'));if(!f)throw Error('unknown file');engine.refresh(f.r,f.rel,true);result={ok:true};}";
const fixed = " else if(u.pathname===base+'/recheck'&&req.method==='POST'&&req.headers['x-dsh-live']==='1'){const f=engine.files.get(u.searchParams.get('id'));if(!f)throw Error('unknown file');engine.refresh(f.r,f.rel,true);result={ok:true};}\n else if(u.pathname===base+'/repair'&&req.method==='POST'&&req.headers['x-dsh-live']==='1')result=repairs.start(u.searchParams.get('id'));";

if (s.includes(broken)) {
  s = s.replace(broken, fixed);
  fs.writeFileSync(f, s);
  console.log('branch repaired');
} else if (s.includes("base+'/repair'") && s.includes("result=repairs.start(") && s.includes("base+'/recheck'")) {
  console.log('already-fixed-or-different: verify below');
} else {
  console.log('PATTERN NOT FOUND — dump context:');
  const i = s.indexOf("base+'/repair'");
  console.log(i >= 0 ? s.slice(Math.max(0, i - 300), i + 300) : '(no repair ref)');
}
