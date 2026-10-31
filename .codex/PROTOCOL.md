# Codex 协作协议（文件握手）

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
