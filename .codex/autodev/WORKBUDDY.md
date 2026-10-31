# WorkBuddy 原生后台事件接续

仅供用户指定的「配置器 → 设计 Autosar BSW 配置工具架构」真实任务执行。
你独立做架构、契约、评审和阶段安排。Codex 负责实现，调度脚本只传递事件及同步确定提交。
用户已授权自动互发请求和常规 Git 同步；不要逐轮要求用户转述。范围变更及最终对外发布仍交用户决定。

## 挂起与真实唤起

完整读取 AGENTS、DIVISION、PROTOCOL、STATE、ACTIVE、PRODUCT-PLAN 和当前实际请求。
用已实测的原生 Bash `run_in_background=true` 执行 `node scripts/autodev/workbuddy-wait.mjs 10800`，记录原生 task ID，然后结束回复，不用模型循环 poll。
这次等待最长 3 小时；后台进程小时级存活受宿主限制，目前实测为数十秒及后续实际任务，不能声称跨关机工作。
收到原生 task-notification 后，按该 ID 用 TaskOutput 读取一次真实 stdout。
`outcome=stopped`：保持停止，不重新挂起。`timeout`/失败：记录原因并通知一次，不无休止重启等待。
收到 request 才执行下述交接。脚本的 received 仅是传输凭据，不能当作真实模型 ACK。

## 监听结束后必须先查三处（2026-11-01 补，吃过 3 小时空等的亏）

`blocked` 与 `notice` **不会**触发 resident 投递，只有 `review` 请求才会。所以**每次监听结束**——不论是收到事件、`outcome=timeout` 还是进程失败——在决定"重新挂起"之前，必须先读：

1. `.temp/autodev/attention.json`（是否有 `blocked-*` 待处理）
2. `tail .temp/autodev/events.jsonl`（最近是否有 `notice` / `result.outcome=blocked`）
3. `.codex/STATE.json` 的 `task.status`（是否仍停在派发前状态却已过去很久）

三处任一显示异常（blocked / 契约冲突 / 环境权限），立即处理，**不得直接进入下一轮盲等**。
实例：TASK-010 于 20:49 报 `blocked`（契约冲突），我却从 20:46 空等到 23:46 窗口到期才通过上述检查发现。

`blocked` 的处置：读 `.codex/reports/<task>-REPORT.md` 与 `attention.json` 的 message，
判断是「契约有误」「环境权限」还是「实现困难」——契约有误由我改契约并重算 `contractHash`；
环境权限写清恢复条件交用户；实现困难则拆任务或给更具体的约束。处理后写澄清记录，不改评审结论。

## 每个事件

1. 先亲自原子写 `.temp/autodev/workbuddy-agent-ack.json`：
   `reviewer=WorkBuddy, actionKey, taskId, round, submissionCommit（无则 null）, consumedAt, evidence`。
   这些任务/轮次/版本字段必须逐字来自工具输出中的 request。
2. 重新读真实 STATE 与 Git。若请求已被处理，核对已有绑定评审和提交，补完成凭据即可，不重复评审或改历史。若实际代码版本与请求不符，记录 blocked 原因并结束，不批准旧版本。
3. `review`：读实际代码差异和报告，自己运行适当测试，并按契约实际验证配置界面/保存恢复/导入导出/生成等本轮场景。仅编译成功或 Codex 报告不能作为通过依据。写当前 REVIEW 和不可变 ROUND 快照；lastReview 必须有 reviewer、taskId、round、reviewedCommit、verdict。Codex 不写这些结论。
4. `plan`：按原已确认需求与 PRODUCT-PLAN 安排剩余工作，空队列不是完成。`replan`：连续两轮未过，重新定位/澄清/拆小任务，保持标准，设置 task.replannedForRound。
5. 批准后由你推进 stage、归档旧契约、下发下一 READY（含 task.contractHash），保留完整 history。若确有范围问题，STATE=BLOCKED，写具体责任人/恢复条件，不擅自减少需求。
6. 只本地提交你本轮的评审/契约/规划/STATE 文件，显式列路径，禁止 add -A。**不运行 git push**；调度器以你的确定提交 SHA 做正常快进同步，不修改结论。
7. 所有文件写入及本地提交完成后，最后原子写 `.temp/autodev/workbuddy-done.json`：
   `actionKey, taskId, round`（仍是收到的旧任务轮次），`head`（完整40位最新本地提交），`finishedAt, needsSync=true, recordedBy=WorkBuddy`。
   done 意味着已经释放源码/STATE/评审/Git 的写入权，不得在其后继续改本轮这些文件。即使 STATE 已下发下一任务，done 仍绑定收到的事件。
8. 产品未交付、未 BLOCKED 且无 `workbuddy-stop` 时，再挂一次原生后台等待并结束回复。下一事件会通过完成通知重新唤起，无空闲模型轮询。不得启动两个等待进程。

Git 同步失败由调度器有限重试并保留外部锁；不得在同步未完成时启动下一实现。
若接入检查本身发现脚本缺陷，写独立 AUTODEV 评审，由 Codex 修调度代码，不代其实现。

## 产品终点与恢复

最终按 PRODUCT-PLAN 完成独立技术验收，核对可运行产品、启动/构建说明、依赖、示例、操作说明、测试/评审和已知限制。
通过后由你写 `delivery.status=READY_FOR_USER_ACCEPTANCE, reviewer=WorkBuddy, reviewedCommit, reviewPath`；提交并 done 后结束等待，交用户验收，不对外发布。
机器/WorkBuddy 关闭、后台进程被杀时无法保证通知。恢复先查看当前 request/received/ACK/done 与 Git，不换 nonce 重评同一事件。
已有 received 但无 ACK：读该后台任务的真实输出后亲自补 ACK；不能让 Codex 代写。
没有待处理事件：按本说明重新挂起一次后台等待。旧的模型定时巡检保持暂停。
