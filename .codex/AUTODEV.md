# 自动开发运行手册

状态文件决定做什么，调度进程负责启动执行器；只有 WorkBuddy 可以写评审结论、批准任务、推进阶段。

## 入口

在仓库根运行（Node ≥18、PowerShell、Codex CLI 已登录）：

```powershell
# 后台启动；再次启动不会创建第二个调度进程
powershell -NoProfile -File scripts/autodev/start.ps1
# 状态、最近结果、接入缺口
node scripts/autodev/dispatch.mjs status
# 停止后续派发；保留正在执行的本轮
node scripts/autodev/dispatch.mjs stop
# 排除失败原因后恢复当前事件，再执行 start.ps1
node scripts/autodev/dispatch.mjs recover
# 调度规则测试（不调用模型、不写真实评审）
node --test scripts/autodev/engine.checks.mjs
```

重启电脑后再次运行 start.ps1，从 `.temp/autodev/runtime.json` 续接，不重新实现已确认任务。
本次不安装系统开机服务、不改登录或应用权限。调度停止不会终止 WorkBuddy 或正在进行的 Git/编码操作。

## 真实调用与边界

1. 初次 TASK-002 round 0 已通过当前 Codex 桌面对话的 computer-use，向用户指定 WorkBuddy 任务实际发送；WorkBuddy 已独立执行测试、写 REVIEW/STATE 并提交。
2. 持续实现使用 `codex exec --approve-for-me -C <仓库>`，stdin 传完整事件，JSON schema 回执，正常受控审批；不使用危险绕过开关。
3. 后台评审桥接设计为 Codex CLI 使用受支持的 computer-use 向同一 WorkBuddy 任务发消息。当前 CLI 应用访问授权被拒，故本地 `config.json.reviewTransportEnabled=false`，不会将未发送的请求记作成功。
4. 已检查 WorkBuddy 自带 CLI、ACP/HTTP 能力；独立调用要求认证，未采用桌面内部令牌或绕过权限。旧定时任务保持暂停。
5. `codex queue --resume` 探针已进入当前对话，但命令警告无本地 daemon；不能作为“空闲自动唤醒成功”的证据，因此未用它作为调度入口。

后台 computer-use 访问得到正常授权并通过真实发送验证后，才可启用 reviewTransportEnabled。
禁止为了打通把 auth none、bypassPermissions、复制认证文件或篡改 WorkBuddy 数据库当作方案。

备用通道实验：在指定 WorkBuddy 任务内执行 `node scripts/autodev/workbuddy-wait.mjs`，等待本地事件作为工具输出返回。只有 WorkBuddy 真正消费输出并自己写回 agent ACK，才算调用成功；脚本的 received 文件不算。当前仅完成脚本准备，尚未证实其执行工具的长时间等待及自动续接能力，未启用此路径。

## 持久化、互斥和证据

- 每 15 秒只读文件，状态稳定 15 秒后生成事件键（任务、轮次、版本、契约/报告/评审内容）。没有变化就不调用模型。
- `runtime.json`：事件账本、次数、执行 PID、当前任务、失败；`events.jsonl`：追加审计。
- `jobs/`：请求、CLI 日志、回执、最终结果；每轮先保存派发意图再启动。
- `dispatcher.lock`：单进程锁；重启发现活子进程只接续观察，不再派发。
- `workbuddy-busy.json` / `workbuddy-done.json`：外部工作租约/完成凭据，防止一方写 STATE 时另一方开工。
- 失败最多 3 次，退避 60/300/900 秒。权限或登录明确缺失直接阻塞，不能反复试探。请求已经发出但超时不自动重发，先核对真实目标会话。
- 工作树中未完成的实现不会被撤销；修复续接先检查现有改动。SUBMITTED 和 APPROVED 强校验代码版本，旧评审不能批准新代码。
- READY/交付/返工均校验 WorkBuddy 下发的 task.contractHash（UTF-8 去 BOM、CRLF 转 LF 后 SHA-256）；缺失或契约改变则停止派发。该字段只能由 WorkBuddy 更新。
- `attention.json` 保存最近需要注意的事件；阶段变化、交付、持续失败、需决策时尝试 Windows 通知，Windows 若压制通知以文件/status 为准。

调度代码和测试可提交；`.temp` 下的路径、任务日志和本机配置不入 Git。禁止双方同时运行旧仓库守护器或手工启动第二个实现器。

## 运行依赖

机器开机、保持唤醒；Codex CLI 的 ChatGPT 登录及网络有效；本地依赖和 Git 凭据可用。
GUI 桥接还需要 WorkBuddy 已登录、桌面会话解锁、computer-use 对该应用有授权。对方出现权限/登录弹窗时自动化会停止并报告，不能代替用户修改安全设置。
关闭机器、休眠、断网、登录过期或额度耗尽时不会承诺继续运行。

## 产品终点

WorkBuddy 维护 PRODUCT-PLAN、任务契约和最终验收清单；已有需求优先，不擅自删减或扩张。
最终独立技术评审后由 WorkBuddy 写入：

```json
{"delivery":{"status":"READY_FOR_USER_ACCEPTANCE","reviewer":"WorkBuddy","reviewedCommit":"40位代码SHA","reviewPath":".codex/review/FINAL-REVIEW.md"}}
```

调度核对版本和评审路径后停止，交用户验收，不再新建无关任务、不自动对外发布。
