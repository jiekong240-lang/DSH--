# 数字孪生·本地监控中枢(digital-twin-monitor)

零依赖 Node + Three.js 本地监控大屏:代码城市、真实 diff 链路、事件时间范围过滤(2026-11-07 新增)。

- 启动:`node server.js`(默认 3210,`PORT` 可覆盖)
- 测试:`node test-events-filter.cjs`(隔离 3999)
- 结构:`server.js` API/事件总线;`public/` Three.js 前端;`sentinel/` 哨兵智能体;`state/` 运行数据(不入库)

公开版已剥离运行数据(state/monitor-records/logs)与本地配置。2026-11-07。
