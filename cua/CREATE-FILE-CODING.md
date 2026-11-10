# Coding Loop：新建源文件能力

在 PR #5 的跨文件编辑基础上，增加 `op: "create"`。例如：

```json
{
  "patches": [
    {"op":"create","path":"helper.js","content":"module.exports = () => 7;\n"},
    {"op":"replace","path":"app.js","oldText":"() => 1","newText":"require('./helper')"}
  ]
}
```

创建仅限项目内部**已有目录**，只允许源代码类型，禁止覆盖任何已有目标，禁止测试、验收脚本和配置文件。支持与替换操作组合，每轮最多五个不同文件。每轮先校验整组补丁，再暂存、发布、执行真实验证命令；创建文件使用独占模式避免覆盖。每轮重新枚举文件，让新文件能进入后续模型观察。

**未实现**：自动创建新目录、复杂 AST 重构、崩溃时多文件事务回滚、真实 Windows GUI/T6 交付。执行前仍建议使用独立 Git worktree，禁止把自动测试绿等同于真实产品完成。
