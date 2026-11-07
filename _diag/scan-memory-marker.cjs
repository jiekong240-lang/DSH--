#!/usr/bin/env node
// scan-memory-marker.cjs — 找出往出站上下文注入记忆标记块的组件(只读)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const SKIP = /node_modules|\.git|attic|sessions|testkit\/runs|evidence/;
const MARKERS = ['跨会话记忆', '相关记忆', '同坑既往经验'];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP.test(p)) walk(p); continue; }
    if (!/\.(mjs|js|cjs|yml)$/.test(f)) continue;
    let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const lines = txt.split('\n');
    lines.forEach((l, i) => {
      if (MARKERS.some((m) => l.includes(m))) {
        console.log(p.replace(/\\/g, '/').replace(ROOT + '/', '') + '  L' + (i + 1) + ': ' + l.trim().slice(0, 110));
      }
    });
  }
})(ROOT);
