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
