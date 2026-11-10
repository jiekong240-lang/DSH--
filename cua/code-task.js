'use strict';
// node cua/code-task.js --project C:\dev\app --goal "fix tests" --verify node --test
const path = require('node:path');
const { runCodingLoop } = require('./coding-loop');
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verify') { out.verifyCommand = argv.slice(i + 1); break; }
    if (['--project', '--goal', '--rounds'].includes(argv[i])) out[argv[i].slice(2)] = argv[++i];
    else throw new Error('unknown argument: ' + argv[i]);
  }
  if (!out.project || !out.goal || !out.verifyCommand?.length) throw new Error('Usage: --project PATH --goal TEXT --verify node --test');
  return { project: path.resolve(out.project), goal: out.goal, verifyCommand: out.verifyCommand, maxRounds: out.rounds || 3 };
}
if (require.main === module) {
  Promise.resolve().then(() => runCodingLoop(parseArgs(process.argv.slice(2))))
    .then(x => { console.log(JSON.stringify({ status: x.status, changedPaths: x.changedPaths })); process.exitCode = x.status === 'verified' ? 0 : 2; })
    .catch(e => { console.error('[coding-loop]', e.message); process.exitCode = 1; });
}
module.exports = { parseArgs };
