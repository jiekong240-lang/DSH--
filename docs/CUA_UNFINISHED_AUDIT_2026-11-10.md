# DSH-- 复杂未完成项处理账与验收边界（2026-11-10）

> **范围澄清**：本账仅依据 GitHub 仓库 \`jiekong240-lang/DSH--\` 在 2026-11-10 可取得的源文件及 PR #3 的提交和 CI；它不是用户电脑 \`dsh-sandbox\` 的运行取证，也不代表 \`DSH-Windows\` 私有仓库同步完成。
>
> **分支**：\`feat/cua-verified-coding-loop-20261110\` → PR #3（草稿，未合并 \`main\`）。\`main\` 基线 \`6ae031594bcaeca6259c06a38fde7d8b5ba4d718\`。改动只落本仓自有 CUA、监控与测试文件，未改官方 DSH 包。

## 一、已实际修复的复杂链条

| 编号 | 源码位置 | 修复的失败模式 | 自动核查 |
|---|---|---|---|
| C1 | \`cua/step-verify.js\`、\`cua/index.js\` | 驱动返回 \`ok\` 或截图文件名变化就把写动作算成功 | 必须出现符合 \`step.expect\` 的观测证据才推进 |
| C2 | \`cua/task.js\`、\`cua/index.js\` | 已派发写动作但未保存进度，重启后重复点击/打字；任务文件损坏被吞掉 | 写前原子保存 pending；恢复时只观察、能证实则推进，不能证实则停止；损坏状态显式报错 |
| C3 | \`cua/index.js\`、\`cua/accessibility.js\` | 模型提议替换计划动作或任意坐标；目标不唯一却点击；PowerShell 递归查找数据丢失 | 计划动作与 postcondition 不可覆写；ref 必须来自真实快照；UIA 从所属窗口搜索、矩形支持两类格式 |
| C4 | \`cua/coding-loop.js\`、\`cua/code-task.js\` | AI 自称已修复、基线早就绿却算成功、修改测试脚本造绿、子进程超时不退出 | 真正运行用户固定验收命令；失败输出回流模型；屏蔽常见测试/验收文件；结果记录 SHA256 与退出码 |
| C5 | \`cua/mcp-server.js\` | 自动编程只能通过独立命令，缺少标准工具调用入口 | MCP stdio \`cua_coding_repair\`：真实子进程、模拟本地 DeepSeek HTTP、实际写入与 Node 测试的纵向测试 |
| C6 | \`cua/brain.js\`、\`cua/observer.js\` | DeepSeek API 未连入 CUA 决策；仅传截图文件路径，不能构成视觉理解 | 在有 \`DEEPSEEK_API_KEY\` 时发送真实 UIA/窗口语义信息给 DeepSeek Chat Completions；外部视觉专用 API 保留 |
| C7 | \`cua/action.js\`、\`cua/freecad-tool.js\` | \`fc-box\`、\`fc-step\` 位置参数与工具签名不一致；\`fc-run\` 方法不存在；文字截断 500 字符、点击缺坐标 | 参数改为对象、补 runScript、结构化 FreeCAD 结果；输入长度与点击条件明确失败 |
| C8 | \`server.js\`、\`public/app.js\`、\`test-events-filter.cjs\` | 哨兵路径 \`ts:0\` 丢失、筛选输入校验不严、筛选计数与全量计数混淆、页面响应过时覆盖、旧测试无条件 exit(0) | 真实临时 HTTP 服务 + 执行源码里的页面筛选函数，覆盖 0、边界、400、计数及 Windows 测试清理 |

这些是**代码修复与自动化证据**，不是 Windows 真机 CUA 完成宣言。回归入口：

- \`node --test cua/tests/*.test.cjs\`
- \`node test-events-filter.cjs\`
- \`node --check cua/index.js\`
- GitHub Actions：\`.github/workflows/cua-coding-loop.yml\`，包含 Windows / Ubuntu 两套工作

本次检查的最新代码提交见 PR #3 文件差异和具体 GitHub Actions 运行结果。旧历史报告里提到的 \`app.js:951 list.innerActivity.list\` 在本轮读取的当前源码已不存在，不能拿旧报告当作今天仍存在的 bug；同理 \`POST /api/event\` 主处理器的 \`ts=0\` 此前已经有专门分支逻辑，本轮新修的是哨兵通道和更全面的断言。

## 二、仍未完成，不能标绿的事项

| 优先级 | 项目 | 为什么不是已完成 | 下一次真实验收 |
|---|---|---|---|
| P0 | DSH 正式安装上的 MCP 注册与调用 | DSH-- 是独立发布仓，未拿到用户当前 \`dsh-sandbox\` 的实时配置/版本与运行日志 | 在实际 DSH 安装注册 MCP，看到 tools/list 和真实 tools/call，执行独立项目验证 |
| P0 | Windows 真机 CUA | CI 的 Windows runner 不拥有可与用户桌面等价的前台会话、真实 UIA/鼠标/键盘目标窗口 | 记事本或可控编辑器：操作→保存→关闭→独立重开→读回内容；留截图与实际日志 |
| P0 | 真实 DeepSeek API 行为 | 测试使用本地模拟 HTTP，不含用户真实密钥与额度 | 使用可丢弃测试项目与实际密钥执行，保留请求/响应状态及产物 |
| P1 | FreeCAD 原生执行与模型产物 | 测试覆盖参数路由/错误码；未在装有 FreeCAD 的机器创建并独立重新打开 \`.FCStd\` 或 \`.step\` | 配置 \`FREECAD_CMD\`，真跑、重开并验证几何/体积/对象数 |
| P1 | 复杂多文件自主开发 | 现有 Coding Loop 只支持现有单文件的唯一文本替换，多轮可累计修改，但不能创建新文件、自动改多文件且保留原子提交 | 选真实小项目，先失败、修复、构建、运行、独立检视和保存可用作品 |
| P1 | 编程任务断电后的持久恢复 | \`coding-loop.js\` 有结果日志但还没有完整的断点回放/副作用重新核验协议；CUA 桌面 pending 是另一条链 | 中途强制结束进程后重启，对比文件哈希与测试输出，确保不重复改写 |
| P1 | 浏览器实际 WebGL 页面交互 | 已执行实际 \`applyEventFilter\` 代码与真实 API；没有真实浏览器页面的人机点击和截图证据 | 打开实际页面、点击查询、核对 DOM/计数并排除控制台异常 |
| P2 | 全屏图像多模态视觉 | DeepSeek Chat 当前链路仅传 UIA/窗口文本，\`screenshot\` 文件路径不等于上传像素；可另接视觉 API | 在用户指定的视觉能力提供者中实测像素图→坐标并与 UIA 交叉核验 |
| P2 | 历史 dsh-sandbox 修复清单 | 仓库中的大型历史报告描述的是别的工作目录和主线，不能用 DSH-- 的这些测试证明它们已修 | 获取该真实仓的当前 SHA、运行日志、测试与本地文件状态，逐项单独核验 |

## 三、下一次执行的可复现指令

在 PR 分支的副本里执行：

\`\`\`powershell
node --test cua/tests/*.test.cjs
node test-events-filter.cjs
node --check cua/index.js
\`\`\`

真实 API 编程任务（必须先设置环境变量 \`DEEPSEEK_API_KEY\`，不要把真实凭据提交仓库）：

\`\`\`powershell
node cua/code-task.js --project C:\dev\disposable-app --goal "修复现存失败的测试" --rounds 3 --verify node --test
\`\`\`

查看 \`C:\dev\disposable-app\.cua-coding-runs\latest\RESULT.json\` 的基线、每轮文件哈希、实际退出码。若 baseline 本来是绿的，结果必须是 \`baseline-passing\`；若出现红项，不得把“模型认为修好”写作 \`verified\`。

要集成 DSH，先以其**真实版本和已支持的 MCP 配置**核实启动方式，再注册 \`node <DSH--绝对路径>\cua\mcp-server.js\`。当前仓库的 MCP 模块是一个可测试的连接入口，**不等于已经在用户正式 DSH 运行时挂上**。

## 四、交付纪律

1. 不用历史文档中的“通过”代替当次代码和运行取证；mock 只证明测试覆盖到的接口行为。
2. 不为了绿而修改验收器、测试范围或跳过失败状态。
3. 产品完成必须用真实环境实际创建、保存并独立重新打开结果；没有这份记录就写 pending。
4. PR #3 未合并前 \`main\` 不具备本轮改动。不能把分支完成表述为 \`main\` 已部署。
