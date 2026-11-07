// patch-default-home.cjs — 缺省家(~/.dsh)补装:智能升梯 + 梯底默认档(堵住"无 DSH_HOME 启动绕过模型池"的洞)
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/.dsh/cordis.patch.yml';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

fs.copyFileSync(f, f + '.bak-ascending-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19));
console.log('backup OK');

const block = `
# ── 2026-10-31 用户令:缺省家也启用智能模型池(质量从低到高升梯,耗尽才见付费确认)──
# 根因:无 DSH_HOME 的 ad-hoc 启动落在本家,绕过工地家的模型池 → 意外直连付费档(已实际发生)。
# 本块 = 工地家同款:梯底默认档 + 11 档免费升梯 + 失败自动爬升;付费仅存于「确认付费」门。
# 免费档质量从低到高:kilo 轻量 → 魔搭 Qwen/GLM → ovh 殿后。
- insert:
    - id: agent-default-model
      name: '@deepseek-ai/dsh-agent-default-model'
      config:
        provider: kilo-free
        model: nvidia/nemotron-3.5-lightning:free
- insert:
    - id: free-ladder
      name: 'dsh-plugin-free-ladder'
      config:
        ladder:
          - 'kilo-free/nvidia/nemotron-3.5-lightning:free'
          - 'kilo-free/poolside/laguna-s-2.1:free'
          - 'kilo-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
          - 'modelscope/Qwen/Qwen3.8-Flash-Next'
          - 'ovh-free/Qwen3.5-9B'
          - 'kilo-free/recursive/flint-v1.0:free'
          - 'modelscope/Qwen/Qwen3.5-35B-A3B'
          - 'kilo-free/nvidia/nemotron-3-ultra-550b-a55b:free'
          - 'modelscope/Qwen/Qwen3.5-397B-A17B'
          - 'modelscope/ZhipuAI/GLM-5.2'
          - 'ovh-free/Qwen3.5-397B-A17B'
`;

if (!s.includes('id: free-ladder') && !s.includes('agent-default-model')) {
  s = s.trimEnd() + '\n' + block;
  fs.writeFileSync(f, s);
  n++; console.log('default-home patch: applied');
} else console.log('already present — skipped');
console.log('done, changes:', n);
