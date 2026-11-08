// cua/agent-desktop-tool.js
// Minimal CUA tool wrapper for agent-desktop.
// Requires: agent-desktop installed (see vendors/agent-desktop/setup.sh)

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function run(cmd, args) {
  const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 30000 });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

const agentDesktopTool = {
  name: 'agent-desktop',
  description: 'Desktop CUA via Accessibility Tree (snapshot / click / type)',
  async snapshot(app) {
    return run('agent-desktop', ['snapshot', '--app', app, '-i']);
  },
  async click(ref) {
    return run('agent-desktop', ['click', ref]);
  },
  async type(ref, text) {
    return run('agent-desktop', ['type', ref, text]);
  },
  async press(keys) {
    return run('agent-desktop', ['press', keys]);
  },
};

module.exports = agentDesktopTool;
