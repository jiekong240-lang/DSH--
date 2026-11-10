# DSH-- CUA 自主编程最小纵向闭环

新增 `cua/coding-loop.js` 和 `cua/code-task.js`：DeepSeek API 读取真实项目文件及测试结果，提出**一个精确的现有文件替换**；执行改动后运行用户固定的测试命令；失败则回传真实报错并重试；只有测试进程退出码为 0 才报告 verified。

## 运行

在 Windows PowerShell 设置 `DEEPSEEK_API_KEY` 后：

```powershell
node cua/code-task.js --project C:\dev\my-app --goal "修复失败的测试" --rounds 3 --verify node --test
```

测试结果保存在目标项目 `.cua-coding-runs/latest/RESULT.json`，包含初始基线、每轮补丁的前后 SHA256、测试输出和最终状态。

## 离线自测

```bash
node --test cua/tests/*.test.cjs
```

## 尚未完成

这是一条真实的单文件精确替换—测试—再修复链，**不是完整产品级编程 Agent**。暂不支持创建文件、多文件重构、自动提交、IDE 控场或自动选择验收标准；DeepSeek API 的实际调用、Windows 真机操作仍需目标电脑验证。仅用户预设命令通过也不能替代独立产品验收。官方 DSH 底座没有修改。