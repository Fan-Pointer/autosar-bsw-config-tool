# 自动执行器契约

用户在 2026-10-31 明确授权：WorkBuddy 规划/独立评审，Codex 实现/修复，自动互发请求、提交及同步。范围变更和最终对外发布留给用户。此授权替代旧版人工等待规则。

## 共通入口

完整读取 AGENTS、STATE、DIVISION、PROTOCOL、ACTIVE、相关 ADR 和报告/真实评审。
请求文件含事件键、任务、轮次、观测状态。开始时重新读 STATE，若事件已过期就回执 completed 并说明实际状态，不再重复执行。
`task.contractHash` 只能由 WorkBuddy 下发/调整契约时写入。Codex 必须保留，不得重算后改小契约；若不匹配应报告阻塞。
先核对 Git 和上一轮产物，保留不属于本轮的文件；禁止 `git add -A`、强推、清空工作树、关闭测试或严格类型检查。
若 `.temp/autodev/workbuddy-busy.json` 存在且相应任务还没有完成凭据，等待该 WorkBuddy 轮次释放，不同时改代码/STATE/提交。
禁止创建内部子代理；禁止自行修改调度器和规划/评审文件。
不要在 `codex exec` 内留下常驻服务（Windows 下会导致 CLI 在最终回执后仍等待子进程，阻塞续接）。
测试所需临时服务必须在 finally 关闭；用户要求的可见预览交父调度层启动并保留，回执给出 URL/启动方式即可。

## implement：Codex 实现与修复

READY 按当前契约实现；CHANGES_REQUESTED 读取绑定当前任务/轮次/版本的 WorkBuddy REVIEW，逐条修阻塞项和重要项。契约文案由 WorkBuddy 认领的事项无需擅改。
先确认 WorkBuddy 提交已完成：评审和 STATE 已被 Git 跟踪且无未提交评审改动。
若现有代码带中断前改动，先核对再续做，禁止覆盖/重来。
按任务运行真实测试和构建；必要时正常请求受控权限，不使用绕过审批/沙箱选项。失败或明确拒绝需要在回执中说明。
报告追加修复条目，不改历史。仅提交本轮代码、测试、报告；取得完整代码提交 SHA。
然后原子更新 STATE 中允许的 task 字段：SUBMITTED、submittedAt、reportPath、submissionCommit；修复轮 round + 1。保留 stage、lastReview 和历史路径，不改评审结论。
单独提交状态后 push。`completed` 意味着实际代码已提交、测试通过且状态交接已提交同步，不能仅有报告。
不要在实现进程里发评审；退出后调度器负责下一事件。

## review / plan / replan：Codex 只做消息桥接

当前首选 resident 模式由调度器直接投递给 WorkBuddy 自己挂起的原生后台进程，收到通知后其按 WORKBUDDY.md 执行；此模式不会启动 Codex CLI GUI 桥接。下述 GUI 规则仅用于已获授权的人工会话恢复或未来明确启用的 desktop-cli 路径。

此功能只在后台 computer-use 获授权后启用。不得使用桌面内部令牌、反向调用 IPC、直接修改 WorkBuddy 数据库或伪造评审。
按 computer-use 技能，通过 `mcp__node_repl` 和 `@oai/sky` 选择已返回的 WorkBuddy 窗口。目标严格为「配置器」空间的「设计 Autosar BSW 配置工具架构」，不是「BSW代码评审 / CodeReview」或旧自动任务。
过滤 accessibility.tree 中含 `wbSeedToken` 的文档 URL，不打印密钥或整份 UI 状态对象。
每次先观察；如果目标正在执行，不能打断、重发或改它的授权弹窗。确认上一请求是否已经发出。截图和观察中真实出现的事件标记才是发送凭据。
新消息写入 `[AUTODEV:<事件键>]`。发送后重新观察到该标记成为用户消息且 WorkBuddy 开始执行，才回执 handed_off。只写文件不算发送成功。
若没有登录、未获应用访问权限、或不能唯一确认目标，返回 blocked。不要伪称成功，不要绕过权限。

发送给 WorkBuddy 的正文必须包括：

- 项目绝对路径，STATE、ACTIVE、报告和评审路径；任务、轮次、submissionCommit、测试证据；本事件标记。
- review：独立读取实际 diff、运行测试和按契约验证功能，不依 Codex 报告或编译成功判定；写当前 REVIEW 和不可变 ROUND 快照。只由 WorkBuddy 更新 task.status/reviewPath 和 lastReview（reviewer=WorkBuddy、taskId、round、reviewedCommit、verdict）。不改 round。
- plan：对照 PRODUCT-PLAN 和原已确认需求安排剩余任务，更新 ACTIVE/STATE=READY、阶段和队列。下发时写 task.contractHash（sha256：UTF-8 文本去 BOM、CRLF 规范为 LF 后计算，可调用 engine.mjs 的 contractDigest）。队列空不是完成；不要另扩完整商业配置器。
- replan：同任务连续两轮不通过，重新定位/澄清或拆小契约，保留质量门槛；STATE 中设 task.replannedForRound=当前 round 后再交 Codex。
- 只暂存 WorkBuddy 本轮拥有的文件并 commit/push，不能同时改业务源码或收走调度文件。完成所有写入和 Git 同步后，最后原子写 `.temp/autodev/workbuddy-done.json`，字段 actionKey、taskId、round、head、finishedAt。
- 最终技术验收需真实运行产品场景、交付文档/示例/限制；通过后 WorkBuddy 写 delivery.status=READY_FOR_USER_ACCEPTANCE、reviewer=WorkBuddy、reviewedCommit、reviewPath，调度结束，用户最终验收。不得对外发布。

发送成功时先写 `.temp/autodev/workbuddy-busy.json`（事件键、时间、taskId、round），再返回 handed_off；不修改 STATE 代替 WorkBuddy。
如果 WorkBuddy 已完成，应核对 done 凭据的事件键/任务/轮次、Git 提交与实际 STATE，移除本轮 busy 文件并回执 completed。只能清除自己确认完成的 busy，不代写 done。

## 结果

按照 receipt.schema.json 回执。权限/登录/范围决策问题用 blocked；临时网络或工具故障用 retryable（最多 3 次）。不要把未知结果当成失败而重复发送：重试先核对原消息标记。
常规状态保持安静；阶段变更、交付、持续失败或需要用户决策时通知。运行日志与回执在 `.temp/autodev/jobs`，不会提交。
