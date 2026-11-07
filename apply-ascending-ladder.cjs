// apply-ascending-ladder.cjs — 原子化应用"质量升梯"改造(读→改→写→自验)
'use strict';
const fs = require('node:fs');
const f = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox/dsh-home/cordis.patch.yml';
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

// 备份
const bak = f + '.bak-ascending-' + stamp;
fs.copyFileSync(f, bak);
console.log('backup:', bak);

let s = fs.readFileSync(f, 'utf8');
const before = s;

// ── ① team-model-router modelMap → {}(角色直通付费取消,全员继承升梯)──
const mmOld = `      config:\n        modelMap:\n          architect: deepseek/deepseek-chat\n          verifier: deepseek/deepseek-chat\n          implementer: modelscope/Qwen/Qwen3.8-Flash-Next`;
const mmNew = `      config:\n        # 2026-10-31 10:41 用户指令:付费角色直通取消,全员继承 Lead = 免费升梯起步\n        modelMap: {}`;
if (s.includes(mmOld)) { s = s.replace(mmOld, mmNew); console.log('① modelMap: replaced'); }
else if (s.includes('modelMap: {}')) { console.log('① modelMap: already applied'); }
else { console.log('① modelMap: PATTERN NOT FOUND (manual check needed)'); }

// ── ② agent-default-model → 梯底(kilo lightning)──
const admOld = `      config:\n        provider: modelscope\n        model: ZhipuAI/GLM-5.2`;
const admNew = `      config:\n        # 2026-10-31 10:41 用户指令:会话从梯底(最低质量档)起步,失败沿升梯爬升\n        provider: kilo-free\n        model: nvidia/nemotron-3.5-lightning`;
if (s.includes(admOld)) { s = s.replace(admOld, admNew); console.log('② default-model: replaced'); }
else if (s.includes('provider: kilo-free')) { console.log('② default-model: already applied'); }
else { console.log('② default-model: PATTERN NOT FOUND'); }

// ── ③ ladder → 质量升梯(全免费 11 档,付费移除)──
const ladOld = `        ladder:\n          - 'modelscope/ZhipuAI/GLM-5.2'\n          # 2026-10-31 用户批准:QUOTA 兜底升收费档(deepseek-chat)。语义=保住已投入的\n          # 任务进度(不切付费=前功尽弃,那才是空转),不是给空转任务续命。在梯内=白名单,\n          # admitStream 放行;旋转到此档即会话粘性,直至会话结束。逐笔审计:free-ladder.log\n          # 的 paid_switch/req_route_override 事件 + model-status.mjs 余额对账。\n          - 'deepseek/deepseek-chat'\n          - 'modelscope/Qwen/Qwen3.8-Flash-Next'\n          - 'kilo-free/nvidia/nemotron-3.5-lightning:free'\n          - 'kilo-free/poolside/laguna-s-2.1:free'\n          - 'kilo-free/nvidia/nemotron-3-ultra-550b-a55b:free'\n          - 'kilo-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'\n          - 'ovh-free/Qwen3.5-9B'\n          - 'ovh-free/Qwen3.5-397B-A17B'`;
const ladNew = `        ladder:\n          # 2026-10-31 10:41 用户指令:质量从低到高的智能化免费升梯(全免费,耗尽才见付费确认)\n          # ① 低档:轻量快枪\n          - 'kilo-free/nvidia/nemotron-3.5-lightning:free'\n          - 'kilo-free/poolside/laguna-s-2.1:free'\n          - 'kilo-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'\n          # ② 中档:魔搭快速道 + ovh 小杯(2RPM 慢,中段冗余)\n          - 'modelscope/Qwen/Qwen3.8-Flash-Next'\n          - 'ovh-free/Qwen3.5-9B'\n          - 'kilo-free/recursive/flint-v1.0:free'\n          # ③ 高档免费:大杯(重活在这里就该跑通)\n          - 'modelscope/Qwen/Qwen3.5-35B-A3B'\n          - 'kilo-free/nvidia/nemotron-3-ultra-550b-a55b:free'\n          - 'modelscope/Qwen/Qwen3.5-397B-A17B'\n          - 'modelscope/ZhipuAI/GLM-5.2'\n          # ④ 殿后:ovh 397B(2RPM 极慢,最后挣扎)\n          - 'ovh-free/Qwen3.5-397B-A17B'`;
if (s.includes(ladOld)) { s = s.replace(ladOld, ladNew); console.log('③ ladder: replaced'); }
else if (s.includes("③ 高档免费")) { console.log('③ ladder: already applied'); }
else { console.log('③ ladder: PATTERN NOT FOUND'); }

// 原子写
const tmp = f + '.tmp-ascending';
fs.writeFileSync(tmp, s, 'utf8');
fs.copyFileSync(tmp, f);
fs.unlinkSync(tmp);

// 自验
const v = fs.readFileSync(f, 'utf8');
const checks = {
  'modelMap 为空': /modelMap: \{\}/.test(v),
  '默认档=梯底kilo': /provider: kilo-free/.test(v) && /nemotron-3\.5-lightning/.test(v),
  '升梯首档kilo': v.indexOf('nemotron-3.5-lightning') < v.indexOf('Qwen3.8-Flash-Next'),
  'GLM-5.2 在高档位': v.indexOf('nemotron-3-ultra') < v.lastIndexOf('ZhipuAI/GLM-5.2'),
  '付费已移出梯子': !/ladder:\n(\s+- '.*'\n)*\s+- 'deepseek\/deepseek-chat'/.test(v),
  'deepseek-chat 总引用清零': !v.includes('deepseek/deepseek-chat'),
};
console.log('=== 自验 ===');
let allOk = true;
for (const [k, ok] of Object.entries(checks)) { console.log((ok ? '✅' : '❌') + ' ' + k); if (!ok) allOk = false; }
console.log(allOk ? 'ALL-PASS' : 'HAS-FAILURES');
console.log('changed-by-this-run:', s !== before);
