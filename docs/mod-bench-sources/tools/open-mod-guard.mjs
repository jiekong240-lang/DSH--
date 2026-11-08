#!/usr/bin/env node
// open-mod-guard.mjs — 改装工位自检(N1-c):pin/实装/reapply 三查,PASS/FAIL 清晰输出
// 用法: node tools\open-mod-guard.mjs   (EXIT 0=PASS, 1=FAIL)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SB = path.resolve(import.meta.dirname, '..');
const require_ = createRequire(path.join(SB, 'package.json'));
let fail = 0;
const check = (name, ok, detail) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

// 1) pin 与实装
const pkg = JSON.parse(fs.readFileSync(path.join(SB, 'package.json'), 'utf8'));
const pin = pkg.dependencies['@deepseek-ai/dsh'];
check('N1-c.1 package.json pin == 0.2.1-rc.2', pin === '0.2.1-rc.2', 'pin=' + pin);
const inst = require_('@deepseek-ai/dsh/package.json');
check('N1-c.1b require 实装 == pin', inst.version === pin, 'installed=' + inst.version);

// 2) 官方包无本地改动提醒(git status 含 @deepseek-ai 则 FAIL)
const git = 'C:/Users/64562/.workbuddy/binaries/PortableGit/versions/1.3.0/cmd/git.exe';
try {
  const st = spawnSync(git, ['status', '--porcelain'], { cwd: SB, encoding: 'utf8' });
  const dirty = (st.stdout || '').split('\n').filter(l => l.includes('@deepseek-ai/'));
  check('N1-c.2 官方包路径无未提交改动', dirty.length === 0, dirty.join(' | ') || 'clean');
} catch (e) { check('N1-c.2 官方包路径无未提交改动', false, e.message); }

// 3) reapply --check(只报告态)退出码与四态摘要
const r = spawnSync(process.execPath, [path.join(SB, 'patches/reapply-all.cjs'), '--check'], { cwd: SB, encoding: 'utf8' });
check('N1-c.3 reapply --check 退出码==0', r.status === 0, 'exit=' + r.status);
const states = [...(r.stdout || '').matchAll(/\[(\w[\w-]*)\] ([^\r\n(]*)/g)].map(m => `${m[1]}=${m[2].trim().slice(0, 30)}`);
console.log('  reapply 四态: ' + states.join(' | '));

console.log(fail === 0 ? 'GUARD: PASS' : 'GUARD: FAIL (' + fail + ')');
process.exit(fail === 0 ? 0 : 1);
