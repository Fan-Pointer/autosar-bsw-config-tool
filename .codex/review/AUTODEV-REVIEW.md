# AUTODEV 调度器评审（独立于产品代码）

> reviewer：WorkBuddy ｜ 审阅提交：`3376824a7022378288336fd114fb41c70f49d48d`（含前置 `087c7a5` 引入的调度实现）
> 时间：2026-10-31T23:58:00+08:00 ｜ 范围：`scripts/autodev/**`、`.codex/autodev/**`、`AGENTS.md`、`PROTOCOL.md`、`DIVISION-OF-WORK.md`、`run-task.*`
> **本文件不评审 TASK-002 产品代码**（见 `TASK-002-ROUND-1-REVIEW.md`），两类版本不得混淆。

## 一、结论

**通过（有条件）**：调度器可投入使用，未见会导致错误批准或重复实现的缺陷。发现 **1 项重要缺陷**（契约哈希未做绑定校验，见 §四），4 项建议。重要缺陷不影响本轮 TASK-002 判定，但应在下一轮修复。

## 二、协议授权核查

用户 2026-10-31 明确授权「SUBMITTED → 自动触发评审」并「同步更新协作说明」，因此 `AGENTS.md` / `PROTOCOL.md` / `DIVISION-OF-WORK.md` / `run-task.*` 的调度升级**属授权范围，不判越权**（我此前在 round-0 的疑虑到此作废）。

但两条边界仍成立并被遵守：
- Codex 未写 `review/**`、未改 `stage`、未代写评审结论 ✅
- 调度进程不产生批准动作，仅派发 ✅

## 三、实现质量（做得对的，逐条留证）

| # | 机制 | 位置 | 为什么重要 |
|---|---|---|---|
| 1 | JSON 原子写（临时文件 + rename） | `engine.mjs:11-15` | 调度器随时可能被 Ctrl-C；半写 journal 会导致状态错乱 |
| 2 | 路径越界防护 | `engine.mjs:18-24` `artifact()` | 防止 STATE 里写 `../../x` 读到仓库外文件 |
| 3 | **提交版本绑定** | `engine.mjs:35-42` `checkVersion()` | 要求 `submissionCommit` 是 HEAD 祖先，**且提交后产品路径无改动、无未跟踪文件**；这是防止「评审的是旧代码」的关键，很多自动闭环死在这里 |
| 4 | 评审一致性矩阵 | `engine.mjs:73-76` | `reviewer/taskId/round/reviewedCommit/verdict` 五元组必须自洽，否则抛错；杜绝「评审写 A 轮、STATE 记 B 轮」 |
| 5 | 评审产物必须含 commit 与 taskId | `engine.mjs:84-85` | 防止拿别的任务评审文件冒充 |
| 6 | 事件键含内容哈希 | `engine.mjs:48-49,92` | 契约/报告/评审任一变化即换键，避免陈旧事件重复派发 |
| 7 | 幂等判定 | `engine.mjs:97-106` `disposition()` | confirmed 即静默；handed_off 有截止时间；重试有次数上限与退避序列 |
| 8 | 持久回执而非退出码 | `dispatch.mjs:62-96` `collect()` | 注释明写「never by assuming exit = task success」，这是正确的工程判断 |
| 9 | 先落盘意图再 spawn | `dispatch.mjs:103-108` | 崩溃窗口被识别为「不确定」而非「成功」，不会静默重复 |
| 10 | 单实例锁 | `dispatch.mjs:50-59` `openSync(lockPath,'wx')` | 原子创建 + 陈旧 PID 存活检测，避免双调度器 |
| 11 | WorkBuddy 交接锁 | `dispatch.mjs:127-142` | `workbuddy-busy.json` + `workbuddy-done.json` 三元组（actionKey/taskId/round）匹配才释放，防止两端同时改仓库 |
| 12 | 稳定期去抖 | `dispatch.mjs:145-146` | 15 秒内键不变才派发，躲开「正在写文件」的中间态 |
| 13 | 错误指纹聚合 | `dispatch.mjs:163-168` | 同类错误连续 3 次才告警，不刷屏 |
| 14 | 优雅停止 / 可恢复 | `dispatch.mjs:172-175,181-193` | 停止不杀在跑的 worker；`recover` 显式重开事件并留审计 |
| 15 | 诚实标注通道缺口 | `dispatch.mjs:152-153`、`config.reviewTransportEnabled=false` | 未送达不记成功，且不导用桌面令牌。**这条最难得** |
| 16 | 测试与 vitest 隔离 | 提交 `3376824` 把 `engine.test.mjs` 改名 `engine.checks.mjs` | 避免被 `vitest` 当测试收集导致主测试套件污染 |

## 四、发现的问题

### 🟠-A（重要）契约文件未做哈希绑定，理论上可被改小范围后重新派发

| 项 | 内容 |
|---|---|
| 位置 | `engine.mjs:61` 只计算 `payload.contractHash = hashFile(task.contractPath)` 并参与事件键，**未与「下发时的期望哈希」比对** |
| 问题 | 事件键变了就当新事件派发。若 worker 在实现中把 `ACTIVE.md` 的验收项删掉几条，键变化 → 调度器认为这是新任务 → 以缩小后的契约继续实现，且 `checkVersion()` 的 `productPaths` 不含 `.codex/**`，不会拦下 |
| 影响 | 自动闭环最怕的「悄悄降标准」有了技术通路。当前未发生（我每轮都独立核对契约），但机制上缺一道闸 |
| 建议 | 在 `STATE.task` 增加 `contractHash`（由评审方下发时写入），`inspect()` 对 `READY`/`SUBMITTED`/`CHANGES_REQUESTED` 校验当前文件哈希与之一致，不一致直接 `BLOCKED` 并告警。评审方改契约时同步更新该字段即可 |
| 归属 | 调度器实现（Codex 负责），**不是产品代码**，不阻塞 TASK-002 |

### 🟡-B `jobs/` 与 `events.jsonl` 无清理策略

`dispatch.mjs:102` 每个事件都写 `jobs/<jobId>.request.json`，`audit()` 追加 `events.jsonl`，长期运行会无限增长。建议保留最近 N 个 job + 按大小轮转，或 `recover` 时清理已 confirmed 的 job 文件。

### 🟡-C 双调度器冲突时错误信息不友好

`acquireLock()` 的 `openSync(..., 'wx')` 在第二个实例时会直接抛 `EEXIST`，未包装成「已有调度器 PID xxx，请先 stop」。建议捕获后给中文提示。

### 🟡-D `checkVersion()` 的 `productPaths` 未含 `bswmd/` 之外的定义源

当前含 `src/tests/bswmd/templates/public/package*.json/index.html/vite.config*/vitest.config*/tsconfig*`。若将来引入 `constraints/`（Python 约束）或 `docs/`（对生成物有影响的模板），需同步加入，否则「提交后改了约束文件」不会被拦。

## 五、通道现状（与 `.temp/autodev/workbuddy-channel.md` 一致）

| 通道 | 状态 |
|---|---|
| Codex → WorkBuddy | 依赖当前 Codex 桌面对话人工触发；`reviewTransportEnabled=false`，不假装已通 |
| WorkBuddy → Codex | 文件 + STATE，调度器轮询读取 ✅ |
| 后台双向全通 | ❌ 未达成，`Computer Use was not approved to use workbuddy` 仍成立 |

我不重试 CLI 会话唤醒（需要读桌面 auth 目录，安全策略已拒绝），维持「文件握手 + 调度器轮询」为唯一可靠链路。

## 六、对协作说明改动的核对

| 文件 | 改动性质 | 我的意见 |
|---|---|---|
| `AGENTS.md` | SUBMITTED 语义由「等待人工」改为「自动触发评审」；新增先提交取 SHA 再改 STATE 的顺序 | ✅ 与用户授权一致，且「先提交再改状态」这条解决了 round 0 中 submissionCommit 缺失的根因 |
| `PROTOCOL.md` / `DIVISION-OF-WORK.md` | 补充调度角色 | ✅ 未改变决策权归属（stage/review 仍属评审方） |
| `run-task.*` | 保留 | ✅ 未被滥用为绕过评审的入口 |

## 七、建议修复顺序

1. 🟠-A 契约哈希绑定（下轮随产品任务一起做）
2. 🟡-B 清理策略
3. 🟡-C 锁冲突提示
4. 🟡-D productPaths 补全

以上均不阻塞 TASK-002 批准。

---

## 八、修复复核（2026-11-01 追加 · commit `3be16bb7f3b34acfc77f554da8f9580ebfa318a8`）

### 🟠-A 契约哈希绑定 → **已闭环 ✅**

| 核验点 | 实现 | 结论 |
|---|---|---|
| 归一化摘要 | `engine.mjs:10-11` `contractDigest()`：去 BOM + `CRLF→LF` 后取 SHA-256 | ✅ 解决 Windows 检出 CRLF 导致哈希漂移的真问题 |
| 强制校验 | `inspect()` 中 `task.contractHash` 缺失或不等于当前摘要即抛错（`BLOCKED` 除外） | ✅ 截断了我提出的「改小契约范围→事件键变化→重新派发」通路 |
| contractPath 缺失也拦 | `:70` `else if (task.status !== 'BLOCKED') throw` | ✅ 比我的建议更严 |
| 规则测试 | `node --test scripts/autodev/engine.checks.mjs` → **12/12 通过**，含 `contract digest tolerates BOM/CRLF checkout but preserves requirements and spacing` | ✅ 本人实跑复核 |
| 赋值权归属 | 由评审方写入（本轮我算 `1b9d5d8c…dafa` 并写进 `STATE.task.contractHash`），Codex 未代赋 | ✅ 权责清晰 |

补记一条操作约定：**我每次修改 `ACTIVE.md` 后必须同步重算并写入 `contractHash`**，否则调度器会一直拒派。这一成本换来了契约防篡改，值得。

### 通道验证结果（见 `.temp/autodev/workbuddy-resident-capability.md`）

- 原生前台长等 + stdout 投递：**实测可用**，本轮真实收到 `resident-probe-1793465472704`，已亲自写 ACK。
- 真正常驻、轮次结束后自动唤醒：**不可达**，受单次工具调用 10 分钟上限与轮次边界限制。
- 结论：调度器继续作驱动方，WorkBuddy 侧按需长等，不声称常驻。

### 仍未关闭

🟡-B（jobs/与 events.jsonl 无清理）、🟡-C（锁冲突提示不友好）、🟡-D（`productPaths` 未含未来约束/模板目录）三项维持原状，不阻塞。

---

## 九、resident 通道接入复核（2026-11-01 01:05 · commit `21af545965d32fd02c0f3b52c6069dd455e28de9`）

评审对象：`scripts/autodev/resident.mjs`（新增）、`dispatch.mjs`（接入）、`workbuddy-wait.mjs`（stop 支持）、`resident.checks.mjs`（新增检查）。依据 `.codex/autodev/WORKBUDDY.md`。
**判定：无阻塞，可挂起。** 以下 4 项观察建议改进，均不影响本轮接入。

### 逐项核验（我实跑，不采信声明）

| # | 机制 | 位置 | 结论 |
|---|---|---|---|
| 1 | 传输与真 ACK 分层 | `resident.mjs:16-20` `matchesAgentAck()` 校验 `reviewer/actionKey/taskId/round/submissionCommit` 五元组 | ✅ 脚本 `received` 无法冒充 agent ACK |
| 2 | 监听活性判定 | `:9-13` `listenerReady()`：心跳年龄 `[-5s, 30s)`，容未来时钟偏差 | ✅ 解决「文件在、进程已死」误判；心跳由 waiter 每 1 秒刷新 |
| 3 | 发布前 fail-closed | `dispatch.mjs` resident 分支先查 `listenerReady`，否则 notice 且**不投递** | ✅ 宁可延迟也不丢事件 |
| 4 | 不重发已消费事件 | `:41-58` `reconcileResident()`：已 received/published 同键则不再写；命中 ACK 才转 `handed_off` | ✅ 幂等 |
| 5 | 崩溃恢复 | `dispatch.mjs` 主循环对 `status==='awaiting_ack' && request` 的记录重放 publish | ✅ intent 先落盘、可续 |
| 6 | 同步只推评审方确定提交 | `:61-76` `syncReviewerCommit()`：要求 40 位 SHA、祖先校验、`owned` 四类文件必须全部已提交 | ✅ 半成品无法被同步 |
| 7 | 非强推 | `git push origin ${head}:refs/heads/main`，非快进即抛错 → 有限重试 → notice | ✅ 不丢远端提交 |
| 8 | 停止语义 | waiter 每轮检查 `workbuddy-stop`，输出 `outcome=stopped`；dispatch 启动时清理该标记 | ✅ 与 WORKBUDDY.md 一致 |
| 9 | 规则测试 | `node --test scripts/autodev/resident.checks.mjs` → **5/5 通过**（stale heartbeat / ACK 五元组 / received≠ACK / 一次投递+stop / 只推确定提交） | ✅ 我本机实跑复核 |
| 10 | 回归 | `engine.checks.mjs` 仍 12/12（3be16bb 后未退化） | ✅ |
| 11 | 路由边界 | resident 仅用于 `kind !== 'implement'`；实现仍走 `codex exec` | ✅ 职责未混淆 |

### 观察（建议改进，不阻塞）

**R1｜同步 push 是本机最脆环节**
`syncReviewerCommit` 由调度器直接 `git push`。本机 HTTPS 曾因 TLS 中断失败，SSH 路径可能弹授权框；`execFileSync` 仅 30s 超时，交互挂起会变成一次失败重试。建议设 `GIT_SSH_COMMAND='ssh -o BatchMode=yes'` 让失败快速显性，而不是等超时。

**R2｜180 秒 ACK 窗口从 publish 起算**
`agentAckTimeoutSeconds=180`。若我从「收到通知」到「落 ACK」超过 3 分钟（模型启动+读上下文本就有开销），会产生一次 `ack-timeout` notice（幂等、不阻断）。建议放宽到 600s，或改为「检测到监听消费后开始计时」。

**R3｜`attempts` 计数器复用**
resident 分支 `record.attempts += 1` 与 `disposition()` 的 `attempts >= maxAttempts` 共用同一计数。若同键发生重放，可能提前进入 `exhausted`。建议 ACK 等待与派发重试分开计数。

**R4｜`owned` 守卫需要显式文档化**
同步要求 `.codex/STATE.json`、`.codex/tasks`、`.codex/review`、`.codex/PRODUCT-PLAN.md` **全部已提交**，任何一处残留未提交即抛错。这是正确的强约束，但 `WORKBUDDY.md` 只写了「只本地提交自己的文件」。建议把四个路径写死进文档，避免评审方漏提交导致同步卡死。

**R5｜HEAD 含未推送实现提交时的边界**
`--is-ancestor head HEAD` 只保证我的提交在历史里；若此时 HEAD 已含 Codex 未推送的实现提交，push 我的 head 到 main 会留下「实现提交未同步」。当前编排中 Codex 自行推送，风险低；建议 push 前记录 `origin/main` 与 HEAD 关系以便事后对账。

### 接入结论

`reviewTransport=resident` 已生效，`residentListenerReady=false`（我尚未挂起），当前事件为 `implement / TASK-003`（Codex 实现中，工作区有其未提交改动）。本轮**不触碰**产品源码、`STATE.json`、契约与已提交评审，`AUTODEV-REVIEW.md` 的本次追加留待下一正式产品事件时一并提交。
