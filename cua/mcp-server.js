'use strict';
/**
 * MCP stdio adapter for the already-tested coding loop. JSON-RPC messages
 * are one JSON object per line. stdout is reserved for protocol messages.
 * No core @deepseek-ai/dsh changes or additional npm dependencies.
 */
const readline = require('node:readline');
const path = require('node:path');
const { runCodingLoop } = require('./coding-loop');
let running = false;
const VERSION = '2025-03-26';

const REPAIR_TOOL = {
  name: 'cua_coding_repair',
  description: 'Inspect real project, edit one existing source snippet per round, run owner-specified verification, and report evidence. Only a passing subprocess test marks verified.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Absolute local project directory' },
      goal: { type: 'string', description: 'Concrete coding task' },
      verifyCommand: {
        type: 'array', minItems: 1,
        items: { type: 'string' },
        description: 'Fixed verifier argv, e.g. ["node","--test"]'
      },
      maxRounds: { type: 'integer', minimum: 1, maximum: 8, default: 3 },
    },
    required: ['project', 'goal', 'verifyCommand'],
    additionalProperties: false,
  }
};

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}
function rpcError(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message: String(message).slice(0, 500) } });
}
function toolResponse(id, value, isError = false) {
  send({
    jsonrpc: '2.0', id,
    result: { content: [{ type: 'text', text: JSON.stringify(value) }], isError },
  });
}
function validateArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('ARGUMENTS_OBJECT_REQUIRED');
  if (typeof args.project !== 'string' || !path.isAbsolute(args.project)) throw new Error('ABSOLUTE_PROJECT_REQUIRED');
  if (typeof args.goal !== 'string' || !args.goal.trim()) throw new Error('GOAL_REQUIRED');
  if (!Array.isArray(args.verifyCommand) || args.verifyCommand.length === 0 ||
      !args.verifyCommand.every(x => typeof x === 'string' && x.length > 0)) {
    throw new Error('VERIFY_ARGV_REQUIRED');
  }
  if (args.maxRounds !== undefined && (!Number.isInteger(args.maxRounds) || args.maxRounds < 1 || args.maxRounds > 8)) {
    throw new Error('ROUNDS_OUT_OF_RANGE');
  }
}

async function dispatch(message) {
  const id = message?.id;
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    rpcError(id, -32600, 'Invalid JSON-RPC request');
    return;
  }
  if (id === undefined) return; // MCP notifications never receive responses
  switch (message.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: message.params?.protocolVersion || VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'dsh-cua-coding', version: '0.1.0' },
          instructions: 'Only call after supplying an absolute local project, a goal and a fixed verification command. Inspect RESULT.json for evidence.'
        },
      });
      return;
    case 'ping':
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: [REPAIR_TOOL] } });
      return;
    case 'tools/call': {
      if (message.params?.name !== REPAIR_TOOL.name) {
        rpcError(id, -32602, 'Unknown tool');
        return;
      }
      try { validateArgs(message.params.arguments); }
      catch (e) { rpcError(id, -32602, e.message); return; }
      if (running) {
        toolResponse(id, { status: 'busy', reason: 'ANOTHER_CODING_TASK_RUNNING' }, true);
        return;
      }
      running = true;
      try {
        const args = message.params.arguments;
        const result = await runCodingLoop({
          project: args.project, goal: args.goal,
          verifyCommand: args.verifyCommand,
          maxRounds: args.maxRounds || 3,
        });
        toolResponse(id, {
          status: result.status,
          project: result.project,
          changedPaths: result.changedPaths || [],
          rounds: result.rounds.length,
          baseline: result.baseline,
          reportPath: path.join(result.project, '.cua-coding-runs', 'latest', 'RESULT.json'),
        }, result.status !== 'verified' && result.status !== 'baseline-passing');
      } catch (error) {
        toolResponse(id, { status: 'not-verified', error: String(error.message || error) }, true);
      } finally {
        running = false;
      }
      return;
    }
    default:
      rpcError(id, -32601, 'Method not found');
  }
}
if (require.main === module) {
  const lines = readline.createInterface({ input: process.stdin, terminal: false });
  lines.on('line', line => {
    try { void dispatch(JSON.parse(line)).catch(e => rpcError(null, -32603, e.message)); }
    catch { rpcError(null, -32700, 'Parse error'); }
  });
}
module.exports = { dispatch, validateArgs, REPAIR_TOOL };
