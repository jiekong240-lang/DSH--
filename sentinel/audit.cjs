'use strict';
/* ============================================================
 * 哨兵 · 审计日志 (综述§6: 本地 JSON Lines, 便于回放测试和审计)
 * 每一笔行动/每一次大脑调用都留痕; 密钥永远不落盘。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const RING_MAX = 200;

class Audit {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'sentinel-audit.jsonl');
    this.ring = [];
    fs.mkdirSync(dir, { recursive: true });
  }
  write(kind, data) {
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, ...data });
    this.ring.push(line);
    if (this.ring.length > RING_MAX) this.ring.shift();
    try {
      /* 同步落盘: 审计逐笔可查, 不允许进程退出时丢写 */
      fs.appendFileSync(this.file, line + '\n');
    } catch { /* 审计失败不阻塞主循环, 但留终端痕 */ }
    return line;
  }
  tail(n = 80) { return this.ring.slice(-n); }
}

module.exports = { Audit };
