@echo off
rem CUA 瞭望哨:每 3 分钟核验全链红绿(大屏:3210 + DSH live-code:3080)
rem 账本: monitor-records\lookout.jsonl;红绿翻转时自动存证截图(经 CUA daemon:19333)
cd /d "%~dp0"
node cua-lookout.cjs --watch 180
