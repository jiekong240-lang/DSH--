// launch-dsh.js — DSH 生产启动器(PATH 补 PortableGit 修 bash ENOENT + 工地家全量插件)
// 用法: node launch-dsh.js [--no-open]
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

const SANDBOX = 'C:/Users/64562/WorkBuddy/2026-10-12-13-09-47/dsh-sandbox';
const GIT_BIN = 'C:/Users/64562/.workbuddy/binaries/PortableGit/versions/1.3.0/usr/bin';

const env = { ...process.env };
env.PATH = GIT_BIN + path.delimiter + (env.PATH || '');
env.DSH_HOME = SANDBOX + '/dsh-home';

const args = [SANDBOX + '/node_modules/@deepseek-ai/dsh/lib/bin.js', 'web'];
// 默认开浏览器;调用方传 --no-open 时抑制
if (process.argv.includes('--no-open')) args.push('--no-open');
const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
child.on('exit', (c) => process.exit(c ?? 0));
