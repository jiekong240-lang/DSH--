// verify-ladder.cjs — 精确校验 ladder 块内的升梯顺序
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/cordis.patch.yml';
const lines = fs.readFileSync(f, 'utf8').split('\n');
const start = lines.findIndex((l) => /- id: free-ladder/.test(l));
let end = start;
for (let i = start; i < lines.length; i++) {
  if (/^- insert:/.test(lines[i]) && i > start) { end = i; break; }
  end = i + 1;
}
const block = lines.slice(start, end);
const rungs = block.filter((l) => /^\s+- '/.test(l)).map((l) => l.trim().replace(/^-\s*'/, '').replace(/'$/, ''));
console.log('LADDER(' + rungs.length + ' 档):');
rungs.forEach((r, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + r));
const expect = [
  'kilo-free/nvidia/nemotron-3.5-lightning:free',
  'kilo-free/poolside/laguna-s-2.1:free',
  'kilo-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'modelscope/Qwen/Qwen3.8-Flash-Next',
  'ovh-free/Qwen3.5-9B',
  'kilo-free/recursive/flint-v1.0:free',
  'modelscope/Qwen/Qwen3.5-35B-A3B',
  'kilo-free/nvidia/nemotron-3-ultra-550b-a55b:free',
  'modelscope/Qwen/Qwen3.5-397B-A17B',
  'modelscope/ZhipuAI/GLM-5.2',
  'ovh-free/Qwen3.5-397B-A17B',
];
const ok = rungs.length === expect.length && rungs.every((r, i) => r === expect[i]);
console.log(ok ? '\nLADDER-ORDER: ✅ 与设计一致(低→高,付费不在梯内)' : '\nLADDER-ORDER: ❌ 与设计不一致');
