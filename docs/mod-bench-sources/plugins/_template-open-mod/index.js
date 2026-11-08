/**
 * _template-open-mod — 薄插件改装模板(复制 plugins/_template-open-mod → plugins/<name>/ 即开工)
 *
 * 挂缝示例:tools.guard(拦截/放行)。需要其它缝(llm/stream、session/event、context 注入)
 * 参照 plugins/bash-gate-dsh(拦截)、memory-dsh(注入)、free-ladder(供给)。
 * 铁律:激活期不得 throw(会进激活失败清单);自带日志;失败禁用不崩进程。
 */
import { Service } from '@deepseek-ai/cordis';

const MOD_NAME = 'template-open-mod'; // ← 复制后改成你的改装名

export default class TemplateOpenMod extends Service {
  static Config = (() => {
    try { const z = require('@deepseek-ai/schemastery'); return z.object({ enabled: z.boolean().default(true) }); }
    catch { return { enabled: true }; }
  })();

  constructor(ctx, config = {}) {
    super(ctx, 'templateOpenMod');
    this.config = { enabled: true, ...config };
    this.log({ ev: 'loaded', mod: MOD_NAME, pid: process.pid });
    // 挂缝示例:拦截所有 bash 工具调用并放行(把 undefined 换成字符串=拒绝)
    ctx.inject(['tools'], (scope) => {
      scope.tools.guard((exec) => {
        const name = String(exec?.name || '');
        if (name === 'bash') this.log({ ev: 'guard_seen', cmd: String(exec?.arguments?.command || '').slice(0, 80) });
        return undefined; // 模板默认全放行;需要拦截时返回拒绝字符串
      });
    });
  }

  log(entry) {
    try { fs.appendFileSync(this.logFile(), `${new Date().toISOString()} ${JSON.stringify(entry)}\n`, 'utf8'); }
    catch { /* 日志失败不影响主流程 */ }
  }
  logFile() { return process.env.DSH_HOME ? process.env.DSH_HOME + '/logs/' + MOD_NAME + '.log' : MOD_NAME + '.log'; }
}
import fs from 'node:fs';
