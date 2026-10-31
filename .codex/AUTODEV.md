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
node --test scripts/autodev/resident.checks.mjs
```

重启电脑后再次运行 start.ps1，从 `.temp/autodev/runtime.json` 续接，不重新实现已确认任务。
本次不安装系统开机服务、不改登录或应用权限。调度停止不会终止 WorkBuddy 或正在进行的 Git/编码操作。

## 真实调用与边界

1. 初次 TASK-002 round 0 已通过当前 Codex 桌面对话的 computer-use，向用户指定 WorkBuddy 任务实际发送；WorkBuddy 已独立执行测试、写 REVIEW/STATE 并提交。
2. 持续实现使用 `codex exec --approve-for-me -C <仓库>`，stdin 传完整事件，JSON schema 回执，正常受控审批；不使用危险绕过开关。
3. 后台评审现采用 WorkBuddy 原生 Bash 后台等待 + task-notification 自动唤起。2026-11-01 已实测：WorkBuddy 回复结束后投递 `async-probe-1793465780300`，后台任务 `06STth` 退出，完成通知自动开启新回合；WorkBuddy 读取真实 stdout 并亲自写 ACK。
4. 调度器 `reviewTransport=resident` 时先核对监听心跳，发布事件后记 awaiting_ack；只有绑定任务/轮次/版本的 WorkBuddy agent ACK 才算实际交接。仅 request/received 文件不能算调用成功。WorkBuddy 写本地提交和 done 后，调度器同步确定 SHA，成功才释放外部锁。
5. Codex CLI 直接 computer-use 访问 WorkBuddy 仍被拒；此路未启用。WorkBuddy 自带 CLI 独立调用仍要求认证，未采用桌面内部令牌或绕过权限。旧模型定时巡检保持暂停。
6. `codex queue --resume` 探针已进入当前对话，但命令警告无本地 daemon；未用它作为调度入口。

只有真实后台通知探针验证后才启用 resident；若退回 desktop-cli，仍需其应用访问正常授权和真实发送验证。
禁止为了打通把 auth none、bypassPermissions、复制认证文件或篡改 WorkBuddy 数据库当作方案。

WorkBuddy 一侧的启动/恢复口令：**“按 `.codex/autodev/WORKBUDDY.md` 核对未完成交接并重新挂原生后台监听。”** 由指定任务执行一次即可；正常每轮由其自行重新挂起。单次脚本窗口 3 小时，无模型空闲轮询。小时级存活及应用重启后的自动恢复尚未验证；不能宣称跨关机工作。
启动顺序：先 start.ps1，再在指定 WorkBuddy 任务挂监听。stop 会停止派发并结束等待，已执行的实现/评审仍完成；显式恢复时依上述两步，不清空账本。若只是 Git 同步连续失败，排除原因后 recover 只恢复该确定提交的同步，不重复发评审。

## 持久化、互斥和证据

- 每 15 秒只读文件，状态稳定 15 秒后生成事件键（任务、轮次、版本、契约/报告/评审内容）。没有变化就不调用模型。
- `runtime.json`：事件账本、次数、执行 PID、当前任务、失败；`events.jsonl`：追加审计。
- `jobs/`：请求、CLI 日志、回执、最终结果；每轮先保存派发意图再启动。
- `dispatcher.lock`：单进程锁；重启发现活子进程只接续观察，不再派发。
- `workbuddy-busy.json` / `workbuddy-done.json`：外部工作租约/完成凭据，防止一方写 STATE 时另一方开工。
- `workbuddy-listener.json` 心跳；`workbuddy-request.json`、`workbuddy-received.json` 为传输层；`workbuddy-agent-ack.json` 必须由真实 WorkBuddy 写；`workbuddy-synced.json` 记录确定提交同步。
- 失败最多 3 次，退避 60/300/900 秒。权限或登录明确缺失直接阻塞，不能反复试探。请求已经发出但超时不自动重发，先核对真实目标会话。
- 工作树中未完成的实现不会被撤销；修复续接先检查现有改动。SUBMITTED 和 APPROVED 强校验代码版本，旧评审不能批准新代码。
- READY/交付/返工均校验 WorkBuddy 下发的 task.contractHash（UTF-8 去 BOM、CRLF 转 LF 后 SHA-256）；缺失或契约改变则停止派发。该字段只能由 WorkBuddy 更新。
- `attention.json` 保存最近需要注意的事件；阶段变化、交付、持续失败、需决策时尝试 Windows 通知，Windows 若压制通知以文件/status 为准。

调度代码和测试可提交；`.temp` 下的路径、任务日志和本机配置不入 Git。禁止双方同时运行旧仓库守护器或手工启动第二个实现器。

## 运行依赖

机器开机、保持唤醒；Codex CLI 的 ChatGPT 登录及网络有效；本地依赖和 Git 凭据可用。
原生后台路径需要 WorkBuddy 已登录、指定任务的后台等待仍运行、宿主能投递 task-notification。初次挂起用当前已授权桌面会话完成；正常交接不再依赖后台 Codex 操作 WorkBuddy 窗口。对方出现权限/登录弹窗时自动化会停止并报告，不能代替用户修改安全设置。
关闭机器、休眠、断网、登录过期或额度耗尽时不会承诺继续运行。

## 产品终点

WorkBuddy 维护 PRODUCT-PLAN、任务契约和最终验收清单；已有需求优先，不擅自删减或扩张。
最终独立技术评审后由 WorkBuddy 写入：

```json
{"delivery":{"status":"READY_FOR_USER_ACCEPTANCE","reviewer":"WorkBuddy","reviewedCommit":"40位代码SHA","reviewPath":".codex/review/FINAL-REVIEW.md"}}
```

调度核对版本和评审路径后停止，交用户验收，不再新建无关任务、不自动对外发布。
