# 自动闭环搭建记录

维护者：Codex，2026-10-31。此文件是接入/实现报告，不是 WorkBuddy 评审。

## 已取得的真实证据

- 用户指定目标：「配置器 → 设计 Autosar BSW 配置工具架构」。23:18 通过 computer-use 实际发送 TASK-002 round 0 请求；随后观察到 WorkBuddy 开始读请求和独立运行测试。
- 评审版本 `7c3a3a7f2cbcec6c84f89f2d6078e31ac093f7d5`，WorkBuddy 写 `TASK-002-REVIEW.md` 与 `TASK-002-ROUND-0-REVIEW.md`、STATE 和 PRODUCT-PLAN；提交 `23a10ec`，结论 CHANGES_REQUESTED。
- WorkBuddy 实测 build 和 35 项测试通过（含 GCC），另从实际代码发现 multiplicity / 容器增删 API / 校验诊断问题。Codex 未写评审或修改结论。
- 两个旧 WorkBuddy 自动化已由其使用原生 automation_update 暂停，保留配置历史。
- Codex CLI 只读探针成功调用模型并读取本项目状态。独立 `codex queue --resume` 探针进入当前桌面对话，但没有 daemon 的警告意味着未证明空闲唤醒。

## 尚未通过的接入验证

- WorkBuddy 自带 CLI 非交互请求返回 Authentication required。没有复制/导出认证材料。
- 后台 Codex CLI 的 computer-use 实读 WorkBuddy 窗口被拒：`Computer Use was not approved to use workbuddy`。当前桌面对话能够访问不等于后台执行器也获授权。
- WorkBuddy 初轮推送曾停在 SSH 文件读取授权；用户反馈“完成”后复核其会话已结束，HEAD 与 origin/main 同为 `23a10ec550ba287e9dc19668e80b831c136f573f`。此项已解除。
- 因而当前不能宣称无人值守两端闭环已经完全打通。默认 reviewTransportEnabled=false，保留明确阻塞。

## 调度器

实现于 scripts/autodev；协议及分工升级到 1.1。包括事件去重、稳定期、版本绑定、唯一调度锁、进程恢复、有限重试、实际回执、WorkBuddy 完成租约和最终交付停止。
使用受支持 Codex CLI；应用权限缺口不会通过绕过开关规避。运行及恢复方式见 `.codex/AUTODEV.md`。

## 验证结果与待接续

- 调度规则测试 10/10 通过：Git 临时仓库验证版本漂移、任务/轮次/身份绑定、修复中断续接、两轮重定位、事件去重、有限重试、空队列及最终交付边界。沙箱不允许临时 Git 配置写入，正常权限重跑通过。
- 隐藏后台启动已成功（初次 PID 23352），重复启动返回同一 PID；status 能读取真实 CHANGES_REQUESTED 和外部交接锁。Windows PowerShell 5 的 UTF-8 读取已修复。
- 停止后 status 确认 running=false，重启为新 PID 18488，并保留当前状态与外部锁；无重复模型调用。
- WorkBuddy 释放本轮交接后由调度器实际启动 TASK-002 修复。
- 上项已验证：状态稳定后自动启动 job `ed076df1ddf5d6afd5df17eb-1`，完成首轮修复；52/52 测试（含 GCC）及 build 通过。代码提交 `e125f86fab069e94b347ad6b9dca2baf10582239`，状态提交 `efa166de7e064065af5bbc03b66224f9ffae35db` 均已同步，STATE=SUBMITTED / round 1。
- 实际恢复缺陷：CLI 内启动的常驻 Vite 服务使 CLI 在最终回执后不退出；停止该已知服务后执行器立即退出并生成 result。预览已移至父会话管理，WORKER 明确禁止留下常驻子服务。
- 后台浏览器权限缺失时，子执行器如实返回 blocked。父对话已实际在可见 IAB 打开 `http://127.0.0.1:3000/workspace`，观察到配置树/表单/保存/验证并保留交付页，完成用户的界面展示要求。
- 用户完成授权后后台 WorkBuddy 访问复验仍被拒；不重试或绕过，后台 reviewTransportEnabled 继续为 false。当前桌面对话可继续真实发送评审。
- 后台桥接得到授权后，再实际验证 round 1 请求发送、版本绑定评审、下一 READY 自动领取。

## 产品规划需由 WorkBuddy 对齐

其新 PRODUCT-PLAN 将 ARXML 导入列为暂不做，并遗漏部分 docs/REQUIREMENTS.md 中已有导入/导出/JSON 场景。Codex 不自行改规划，需 WorkBuddy 对照已确认需求补齐；确需变更必须集中交用户决定，不能把既有能力移成“已知限制”后视为验收通过。
