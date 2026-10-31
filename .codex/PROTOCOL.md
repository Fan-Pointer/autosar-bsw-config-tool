# Codex 协作协议（文件握手）

## 1.1 升级：状态文件 + 实际执行触发（2026-10-31 用户授权）

用户授权双方围绕本项目自动交接、发评审、收意见、修复及 scoped commit/push。
产品范围变更、最终验收和对外发布仍归用户。旧版下方“待命/打开 Codex/每小时巡检”的触发说明保留作历史参考，由本节和 `AUTODEV.md` 替代。

实际入口：`scripts/autodev/start.ps1`。本地 Node 监听每 15 秒检查状态，稳定后按事件键派发；未变时不调用模型。
Codex 实现入口为已实测的 `codex exec --approve-for-me`。WorkBuddy 必须由真实指定任务执行；后台桥接未获权限时明确阻塞，写请求文件不算调用成功。
2026-11-01 原生后台探针已验证：WorkBuddy 自己挂 Bash 后台文件等待，完成通知自动唤起真实任务，亲自写 agent ACK。协议见 `autodev/WORKBUDDY.md`。常规评审由 WorkBuddy 独立本地提交后写 needsSync done，调度器只把该确定 SHA 正常推送；同步成功才启动下一轮。此传输分工不转移评审、契约或 stage 决策权。
使用 `AUTODEV.md` 的状态/停止/恢复命令；本地日志在 `.temp/autodev`，不入 Git。

| 状态 | 自动动作 | 决策人 |
|---|---|---|
| READY | Codex 读契约、实现、自检、报告、提交代码及版本绑定交接 | Codex 只负责实现 |
| SUBMITTED | 向指定 WorkBuddy 任务发带任务/round/submissionCommit 的请求并观察发送成功 | WorkBuddy 独立评审 |
| CHANGES_REQUESTED | 验证评审版本后修阻塞/重要项，测试、追加报告、round+1 重提 | Codex |
| APPROVED | 请求 WorkBuddy 按产品计划下发下一 READY，空队列也要核对剩余工作 | WorkBuddy 规划/推进 stage |
| BLOCKED | 保存原因、责任人、恢复条件并通知一次；无变化不重复调用 | 对应责任人/用户 |
| 最终技术验收通过 | WorkBuddy 填 delivery，停止调度，交用户验收 | WorkBuddy 技术审；用户产品验收 |

评审绑定 `lastReview.reviewer=WorkBuddy`、taskId、round、reviewedCommit、verdict；代码提交使用完整 SHA。
每轮保留不可变 `review/<TASK>-ROUND-<N>-REVIEW.md`。源码变化后旧 APPROVED 不得授权新版本。
WorkBuddy 下发契约时写 `task.contractHash`：对 UTF-8 内容去 BOM、CRLF 转 LF 后算 SHA-256。Codex 保留该字段；契约被改小或哈希缺失均停止派发，只有 WorkBuddy 调整契约时可同步更新。
连续两轮不通过先由 WorkBuddy 重新定位/澄清/拆任务，设置 `task.replannedForRound` 后再修，不能降低标准。
单个调度进程及子进程互斥；WorkBuddy 工作期间保留 busy 记录，本地提交后写 done，调度器写 synced 后释放。消息必须带唯一事件标记，未知发送结果先对账再重试。
Git 只暂存本轮文件，禁止 add -A 收走对方工作。Codex 不改 review、lastReview、stage 或批准任务。

初次接入证据和当前权限缺口见 `.codex/reports/AUTODEV-SETUP.md`。后台通道未验证时不得报告“无人值守闭环已打通”。

---

## 1.0 历史说明（触发及提交方式以 1.1 为准）

## 核心思路

不靠人盯、不靠闲聊，靠**仓库里的状态文件**完成三人（Codex / 架构师 / 王上）交接。
Codex 桌面端启动时会自动读仓库根的 `AGENTS.md`，这就是自动化的钩子。

## 目录契约

```
autosar-bsw-config-tool/
├── AGENTS.md                      ← Codex 每次自动读取（规约 + 流程）
└── .codex/
    ├── STATE.json                 ← 单一事实源（谁在做什么，到哪一步）
    ├── tasks/
    │   ├── ACTIVE.md              ← 当前任务契约（唯一有效）
    │   └── TASK-00X-*.md          ← 历史任务归档
    ├── reports/
    │   ├── _TEMPLATE.md
    │   └── TASK-002-REPORT.md     ← Codex 写
    └── review/
        ├── _TEMPLATE.md
        └── TASK-002-REVIEW.md     ← 架构师写
```

## 状态机

```
        ┌─────────────────────────────────────────┐
        │                                         │
   [架构师]                                      │
   写 ACTIVE.md + STATE=READY                    │
        │                                        │
        ▼                                        │
   ┌─────────┐    Codex 实现 + 写报告     ┌────────────┐
   │  READY  │ ────────────────────────► │ SUBMITTED  │
   └─────────┘                            └────────────┘
                                                │
                                     [架构师] 评审
                                                │
                        ┌───────────────────────┴────────┐
                        ▼                                ▼
                ┌───────────────────┐            ┌────────────┐
                │ CHANGES_REQUESTED │            │  APPROVED  │
                └───────────────────┘            └────────────┘
                        │                                │
              Codex 按 REVIEW 修复               架构师下发下一任务
                        │                                │
                        └────► SUBMITTED                 └──► READY(新任务)
```

## 三方操作

### Codex（每轮）
1. 读 `AGENTS.md` → 读 `STATE.json`
2. 按 status 行动（READY 实现 / CHANGES_REQUESTED 修复 / SUBMITTED 待命）
3. 写完报告 → 改 `STATE.json` → commit & push

### 架构师（每轮）
1. 读到 `SUBMITTED` → 看 report + `git diff`
2. 按 `.codex/review/_TEMPLATE.md` 写 `review/TASK-002-REVIEW.md`
3. 改 `STATE.json`：`APPROVED` 或 `CHANGES_REQUESTED`（`round` 不变，Codex 提交时 +1）
4. push，让 Codex 下次 pull 到新状态

### 王上（只在必要时）
- 打开 Codex 桌面端，让它对着仓库跑一轮
- 其余时间不用管

## 自动评审怎么落地

架构师不是常驻进程。自动评审靠**定时任务**：每隔一段时间抓一次仓库状态，
若发现 `status == SUBMITTED` 且有新报告，就自动按清单评审并写回 REVIEW + STATE。

这个定时任务由 WorkBuddy 的 automation 承载（见下）。

## 防呆设计

| 风险 | 防呆 |
|---|---|
| Codex 不看状态直接改代码 | AGENTS.md 第 0 条强制先读；评审时对比 `git diff` 与任务范围，越界即打回 |
| Codex 改 STATE 推进阶段 | AGENTS.md 列为禁区；`stage` 只有架构师改 |
| Codex 自评自过 | 报告只是自述，判定权在 REVIEW 文件 |
| 评审文件被 Codex 篡改 | AGENTS.md 禁改 `.codex/review/**`；git 可追溯 |
| 报告注水 | 报告要求给实测证据（grep 输出、复现步骤），空话视为未交 |
