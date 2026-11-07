#!/usr/bin/env node
// fake-dsh-hang.cjs — 验收器自检用的假 DSH:挂住 60s(配合 STAGE1_LIMIT_MS 短时限验证超时强杀路径)
setTimeout(() => process.exit(0), 60000);
setInterval(() => {}, 1000);
