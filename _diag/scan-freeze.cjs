#!/usr/bin/env node
// scan-freeze.cjs — 独立核实上游冻结点:dsh-agent-loop buildRequest 附近是否存在 Object.freeze(只读)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/node_modules/@deepseek-ai';
let found = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs|cjs)$/.test(f)) continue;
    let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const lines = txt.split('\n');
    lines.forEach((l, i) => {
      if (/Object\.freeze/.test(l) && /(request|options|built|loop)/i.test(l)) {
        console.log(p.replace(/\\/g, '/').split('/node_modules/')[1] + '  L' + (i + 1) + ': ' + l.trim().slice(0, 140));
        found++;
      }
      if (/buildRequest/.test(l) && i < 2000 && /freeze|frozen/i.test(lines.slice(Math.max(0, i - 3), i + 4).join(''))) {
        console.log('[ctx] ' + p.replace(/\\/g, '/').split('/node_modules/')[1] + '  L' + (i + 1) + ': ' + l.trim().slice(0, 120));
      }
    });
  }
})(ROOT);
console.log('freeze+request hits: ' + found);
