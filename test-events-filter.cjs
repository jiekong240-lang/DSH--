/* ============================================================
 * test-events-filter.cjs
 * Verify /api/events filtering with from/to epoch-ms query params
 * 使用 PORT=3999，互不干扰生产实例 (3210)
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3999;
const PUBLIC_DIR = path.join(__dirname, 'public');

let started = false;
let success = false;

function sendRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body ? Buffer.byteLength(body) : 0,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // Start server on PORT=3999 (modify server.js PORT temporarily)
  // We'll use the existing server but on a different port by running a subprocess
  // Actually, let's just test against a running instance on 3999

  // Step 1: Start a temporary server on port 3999
  // We'll copy server.js logic but on 3999
  // Actually easiest: use the existing node server but override PORT
  // Let's start it as a child process

  const serverJs = path.join(__dirname, 'server.js');
  const child = require('child_process').fork(serverJs, [], {
    env: { ...process.env, PORT: '3999' },
    silent: true,
  });

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 500));

  try {
    // Step 2: POST three events with different ts values
    const events = [
      { ts: Date.now() - 100000, source: 'test1', kind: 'tool', target: 'file1.js' },
      { ts: Date.now() - 50000, source: 'test2', kind: 'tool', target: 'file2.js' },
      { ts: Date.now() + 50000, source: 'test3', kind: 'tool', target: 'file3.js' },
    ];

    // POST each event
    for (const ev of events) {
      await sendRequest('POST', '/api/event', JSON.stringify(ev));
    }

    // Step 3: Test range query - query events within [now-110000, now-40000]
    // event1: now-100000 should be in range
    // event2: now-50000 should be in range
    // event3: now+50000 should NOT be in range
    const rangeRes = await sendRequest('GET', '/api/events?from=' + (Date.now() - 110000) + '&to=' + (Date.now() - 40000));
    const rangeData = JSON.parse(rangeRes.body);
    const rangeEvents = rangeData.events || [];

    console.log(`范围查询: 返回 ${rangeEvents.length} 条事件 (预期 2 条: event1&2 在范围内, event3 超出)`);

    if (rangeEvents.length !== 2) {
      console.error(`FAIL: expected 2 events in range, got ${rangeEvents.length}`);
      process.exit(1);
    }

    // Verify ts values are within range
    const ts1 = events[0].ts;
    const ts2 = events[1].ts;
    const ts3 = events[2].ts;

    const inRange1 = rangeEvents.some((e) => e.ts === ts1);
    const inRange2 = rangeEvents.some((e) => e.ts === ts2);
    const notInRange3 = !rangeEvents.some((e) => e.ts === ts3);

    if (!inRange1) { console.error('FAIL: event1 (oldest) should be in range'); process.exit(1); }
    if (!inRange2) { console.error('FAIL: event2 (middle) should be in range'); process.exit(1); }
    if (!notInRange3) { console.error('FAIL: event3 (newest, outside range) should NOT be in range'); process.exit(1); }

    // Step 4: Test 400 when from is not a valid number
    const badFromRes = await sendRequest('GET', '/api/events?from=abc&to=' + (Date.now() + 100000));
    const badFromData = JSON.parse(badFromRes.body);
    console.log(`非法 from: 返回状态 ${badFromRes.status} (预期 400)`);

    if (badFromRes.status !== 400) {
      console.error(`FAIL: expected 400 for invalid from=abc, got ${badFromRes.status}`);
      process.exit(1);
    }
    if (!badFromData.error) {
      console.error('FAIL: expected error message in response');
      process.exit(1);
    }

    // Step 5: Test 400 when to is not a valid number
    const badToRes = await sendRequest('GET', '/api/events?from=100&to=xyz');
    const badToData = JSON.parse(badToRes.body);
    console.log(`非法 to: 返回状态 ${badToRes.status} (预期 400)`);

    if (badToRes.status !== 400) {
      console.error(`FAIL: expected 400 for invalid to=xyz, got ${badToRes.status}`);
      process.exit(1);
    }
    if (!badToData.error) {
      console.error('FAIL: expected error message in response');
      process.exit(1);
    }

    // Step 6: Test full range when no from/to - should return all events (existing behavior)
    const fullRes = await sendRequest('GET', '/api/events');
    const fullData = JSON.parse(fullRes.body);
    const fullEvents = fullData.events || [];

    console.log(`全量查询: 返回 ${fullEvents.length} 条事件 (预期至少 3 条)`);

    if (fullEvents.length < 3) {
      console.error(`FAIL: expected at least 3 events without filter, got ${fullEvents.length}`);
      process.exit(1);
    }

    // Verify all 3 events are present in full range
    const allPresent = events.every((ev) => fullEvents.some((e) => e.ts === ev.ts));
    if (!allPresent) {
      console.error('FAIL: not all 3 events present in full range');
      process.exit(1);
    }

    console.log('所有断言通过!');
    success = true;
  } catch (err) {
    console.error('测试过程出错:', err);
    process.exit(1);
  } finally {
    // Kill the child server
    if (child && !success) {
      child.kill();
    }
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('致命错误:', e);
  process.exit(1);
});