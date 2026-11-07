#!/usr/bin/env node
// scan-messages.cjs — 全 sandbox(除 node_modules/attic)搜 .messages 赋值与该崩溃注释(只读)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const SKIP = /node_modules|\.git|attic|sessions|monitor-records|testkit\/runs/;
const hits = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP.test(p)) walk(p); continue; }
    if (!/\.(mjs|js|cjs)$/.test(f)) continue;
    let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const lines = txt.split('\n');
    lines.forEach((l, i) => {
      if (/\.messages\s*=|Cannot assign to read only/.test(l)) {
        hits.push(p.replace(/\\/g, '/').replace(ROOT + '/', '') + '  L' + (i + 1) + ': ' + l.trim().slice(0, 100));
      }
    });
  }
})(ROOT);
console.log(hits.slice(0, 30).join('\n') || '(no hits)');
console.log('total: ' + hits.length);
