@echo off
rem DSH 生产启动器 — 修复 bash ENOENT(PATH 补 PortableGit)+ 工地家全量插件
set PATH=C:\Users\64562\.workbuddy\binaries\PortableGit\versions\1.3.0\usr\bin;%PATH%
set DSH_HOME=C:\Users\64562\WorkBuddy\2026-10-12-13-09-47\dsh-sandbox\dsh-home
node "C:\Users\64562\WorkBuddy\2026-10-12-13-09-47\dsh-sandbox\node_modules\@deepseek-ai\dsh\lib\bin.js" web
