// patch-default-home2.cjs — 缺省家补齐:provider 面(kilo/ovh 免钥匙 + 魔搭/硅基/DeepSeek)+ .env 同步 + free-ladder 绝对路径
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/.dsh/cordis.patch.yml';
const sandboxEnv = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/.env';
let s = fs.readFileSync(f, 'utf8');
let n = 0;

// ① .env 凭据同步(仅当缺省家没有 .env)
if (!fs.existsSync('C:/Users/64562/.dsh/.env') && fs.existsSync(sandboxEnv)) {
  fs.copyFileSync(sandboxEnv, 'C:/Users/64562/.dsh/.env');
  n++; console.log('.env: synced from sandbox home (keys only, same owner)');
}

// ② free-ladder 挂载名 → 绝对路径(单源真身)
const flOld = "    - id: free-ladder\n      name: 'dsh-plugin-free-ladder'";
const flNew = "    - id: free-ladder\n      name: 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/plugins/free-ladder/index.js'";
if (s.includes(flOld)) { s = s.replace(flOld, flNew); n++; console.log('free-ladder: absolute path'); }

// ③ llm-pi-ai provider 面(升梯引用的全部 provider)
if (!s.includes('id: llm-pi-ai')) {
  const block = `
# ── 2026-10-31 用户令:模型池 provider 面(与工地家同款,缺省家会话直连免费升梯)──
- id: llm-pi-ai
  config:
    providers:
      deepseek:
        apiKeyEnv: DEEPSEEK_API_KEY
      siliconflow:
        displayName: 硅基流动 SiliconFlow
        api: openai-completions
        baseURL: https://api.siliconflow.cn/v1
        apiKeyEnv: SILICONFLOW_API_KEY
        models:
          - id: deepseek-ai/DeepSeek-V4.1-Flash
            name: DeepSeek V4.1 Flash
            contextWindow: 1000000
      kilo-free:
        displayName: Kilo Free(免钥匙)
        api: openai-completions
        baseURL: https://api.kilo.ai/api/gateway/v1
        headers:
          cf-aig-authorization: unused
          Authorization: null
        models:
          - id: recursive/flint-v1.0:free
            name: Flint v1.0
            contextWindow: 262144
          - id: poolside/laguna-s-2.1:free
            name: Laguna S 2.1
            contextWindow: 262144
          - id: nvidia/nemotron-3.5-lightning:free
            name: Nemotron 3.5 Lightning
            contextWindow: 1000000
          - id: nvidia/nemotron-3-ultra-550b-a55b:free
            name: Nemotron 3 Ultra 550B
            contextWindow: 1000000
          - id: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
            name: Nemotron 3 Nano Omni
            contextWindow: 256000
      ovh-free:
        displayName: OVH Free(免钥匙 2RPM)
        api: openai-completions
        baseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
        headers:
          cf-aig-authorization: unused
          Authorization: null
        models:
          - id: Qwen3.5-9B
            name: Qwen3.5 9B
            contextWindow: 262144
          - id: Qwen3.5-397B-A17B
            name: Qwen3.5 397B-A17B
            contextWindow: 262144
      modelscope:
        displayName: 魔搭 ModelScope
        api: openai-completions
        baseURL: https://api-inference.modelscope.cn/v1
        apiKeyEnv: MODELSCOPE_API_KEY
        models:
          - id: Qwen/Qwen3.8-Flash-Next
            name: Qwen3.8 Flash Next
            contextWindow: 131072
          - id: Qwen/Qwen3.5-35B-A3B
            name: Qwen3.5 35B-A3B
            contextWindow: 131072
          - id: Qwen/Qwen3.5-397B-A17B
            name: Qwen3.5 397B-A17B
            contextWindow: 262144
          - id: ZhipuAI/GLM-5.2
            name: GLM 5.2
            contextWindow: 1049000
`;
  const anchor = '- insert:\n    - id: agent-default-model';
  const at = s.indexOf(anchor);
  if (at >= 0) { s = s.slice(0, at) + block + '\n' + s.slice(at); n++; console.log('llm-pi-ai providers: inserted'); }
  else { s = s.trimEnd() + '\n' + block + '\n'; n++; console.log('llm-pi-ai providers: appended (no anchor)'); }
}

fs.writeFileSync(f, s);
console.log('done, changes:', n, '| size:', s.length);
console.log('verify: llm-pi-ai', s.includes('id: llm-pi-ai'), '| kilo-free provider', s.includes('kilo-free:'), '| modelscope', s.includes('modelscope:'), '| free-ladder abs', s.includes('plugins/free-ladder/index.js'));
