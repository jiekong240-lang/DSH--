# Coding Loop：跨文件修改（最多 5 个现有源文件）

在原有单文件 `{path,oldText,newText,reason}` 模型输出之外，新增兼容格式：

```json
{
  "reason": "同一个故障涉及两个模块",
  "patches": [
    {"path":"src/one.js","oldText":"old one","newText":"new one"},
    {"path":"src/two.js","oldText":"old two","newText":"new two"}
  ]
}
```

每轮最多五个**不同的已有源文件**，每个 `oldText` 必须唯一命中；不允许编辑测试、验收脚本或构建配置。先验证整组补丁，再暂存文件、再次核对原始内容并发布，随后只运行一次用户指定的真实验证命令。若发布阶段出错，会尝试恢复已发布文件并显式报告恢复不完整的情况。**这不是数据库级原子事务**：进程在多文件发布中间崩溃仍可能留下部分变更；运行前应使用独立 Git 工作树并保留 checkpoint。

新增回归：两个模块联动修复、第二补丁不合法时第一文件不变、拒绝修改验收器、拒绝重复路径。保持原有单文件 MCP 与 CLI 参数兼容。

**验收边界**：GitHub CI 只证明自动测试；尚未验证真实 DeepSeek API 对跨文件提议的质量、Windows 实机编辑器或完整产品 T6 重开验收。
