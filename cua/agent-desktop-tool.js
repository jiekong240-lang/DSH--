'use strict';
/**
 * agent-desktop — CUA 核心操作通道
 *
 * Accessibility Tree + @ref 精准操作层，优先于纯坐标。
 * 由 action.js 统一调度，供 task 步骤直接使用。
 *
 * 安装： bash vendors/agent-desktop/setup.sh
 */
const { execFile } = require('child_process');

function runAgentDesktop(args, timeout = 25000) {
  return new Promise((resolve) => {
    execFile(
      'agent-desktop',
      args,
      { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          error: err ? String(err.message || err).slice(0, 400) : null,
        });
      }
    );
  });
}

const agentDesktopTool = {
  name: 'agent-desktop',
  description: 'Core desktop CUA via Accessibility Tree',

  async snapshot(app) {
    if (!app) return { ok: false, error: 'app required' };
    return runAgentDesktop(['snapshot', '--app', String(app), '-i']);
  },

  async click(ref) {
    if (!ref) return { ok: false, error: 'ref required' };
    return runAgentDesktop(['click', String(ref)]);
  },

  async type(ref, text) {
    if (!ref || text == null) return { ok: false, error: 'ref and text required' };
    return runAgentDesktop(['type', String(ref), String(text)]);
  },

  async press(keys) {
    if (!keys) return { ok: false, error: 'keys required' };
    return runAgentDesktop(['press', String(keys)]);
  },

  /** 统一步骤入口（供 action.js 调用） */
  async executeStep(step) {
    if (!step || !step.action) return { ok: false, error: 'invalid step' };
    const a = String(step.action).toLowerCase();

    if (a === 'ad-snapshot' || a === 'snapshot') {
      return this.snapshot(step.app || step.target);
    }
    if (a === 'ad-click' || a === 'click-ref') {
      return this.click(step.ref || step.target);
    }
    if (a === 'ad-type' || a === 'type-ref') {
      return this.type(step.ref || step.target, step.text);
    }
    if (a === 'ad-press' || a === 'press') {
      return this.press(step.keys || step.text);
    }
    return { ok: false, error: 'unsupported agent-desktop action: ' + a };
  },
};

module.exports = agentDesktopTool;
