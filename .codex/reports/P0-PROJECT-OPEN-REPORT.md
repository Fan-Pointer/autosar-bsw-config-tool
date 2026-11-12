# P0 首页多工程打开串号修复

日期：2026-11-12。来源：用户本轮 P0 指令及 HANDOFF §10/§11。基线：27ad992。
本修复独立于 TASK-023：未修改 ACTIVE、STATE、阶段或任何评审结论；按最新交接纪律提交主理人审核。

## 根因与修复

**确认根因**：工作区挂载后的全局现场恢复覆盖了首页明确打开的工程。旧 `restoreScene` 用整个库的 UUID 校验 sessionStorage 的 v1 现场，然后调用 `switchConfigSet`。因此没有共享数据也会从 DEMO2 回到 DEMO1；不只是工程标题错误。

先添加真实首页、路由、工作区集成用例，只替换 localforage 磁盘边界。修复前输出原文：

```text
AssertionError: expected 'DEMO1' to be 'DEMO2' // Object.is equality
Expected: "DEMO2"
Received: "DEMO1"
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

遵循先文档后代码，先在 HANDOFF §4 写标准口径，再修改实现：

1. sessionStorage 现场按工程分键，v1 只在活动模块属于当前工程时兼容读取；禁止恢复期间反写旧现场，失效模块的字段选择一并丢弃。
2. initialize 共用在途 Promise，工程索引加载后才置完成；openProject 自身等待初始化，按工程 setUuids 顺序选模块，先保存原工程，失败恢复原工程及选择。
3. 归属诊断直接统计 project.setUuids，独立于恒为空的 unassignedSets。严格索引验证仍拒绝共享；诊断解析不把坏索引接入可编辑状态。共享记录拒绝打开，也不提供工程引用作用域。
4. 恢复面板给出共享、未归属、缺失明细和拆分提示。原始恢复包同时包含原模块库、工程索引、草稿和诊断；只读导出，不静默分配或删除数据。

原 project-manage 的共享测试曾允许一份数据归两个工程并只查标题。按用户唯一归属约束，本轮加强为拒绝共享打开、原选择不变、作用域为空、存储逐字节不变；不是把串号的错误结果继续当通过。受保护的 arxml-interoperability、arxml-fidelity、catalog 三文件零改动，无 it.fails。

## 交付文件

| 文件 | 改动 |
|---|---|
| HANDOFF.md | 先定义 §4 行为，再追加 §11 真实根因与剩余边界 |
| src/ui/WorkspaceScene.ts | 按工程存储/筛选现场、存储异常容错 |
| src/views/WorkspaceView.vue | 当前工程内恢复、恢复写入时序及卸载保护 |
| src/stores/configStore.ts | 初始化与打开时序、失败回退、共享保护、归属诊断及完整导出 |
| src/stores/projectMetadata.ts | 结构校验与唯一归属校验分离、只读归属诊断 |
| src/ui/ConfigSets/RecoveryPanel.vue | 归属问题明细、拆分提示、恢复包下载 |
| tests/project-navigation-e2e.test.ts | 四个集成回归：冷恢复/三工程路由、初始化竞态、失败回退、坏索引保护与导出 |
| tests/workspace-scene.test.ts | 工程隔离、旧现场兼容及存储不可用 |
| tests/project-manage.test.ts | 强化历史共享的唯一归属断言 |
| .codex/reports/P0-PROJECT-OPEN-REPORT.md | 本报告 |
| .codex/reports/P0-PROJECT-OPEN-VERIFY.log | 最终全量验证原始输出 |

## 验证与限制

- jsdom 集成场景挂载真实 HomeView、WorkspaceView、router、store、官方定义，没有用占位工作区。验证 DEMO2/ZZ 模块清单、跨工程返回、同工程 NvM 页签恢复。
- 通过模拟磁盘读阻塞验证初始化没有重复恢复；写失败时保留原工程；共享/孤儿诊断及恢复包导出零存储写入。
- 类型检查、生产构建与性能门禁以报告末尾及原始日志为准。生产构建保留既有大 chunk 提示，未放宽任何预算。
- 桌面启动器 `Start-Configurator.ps1 -NoBrowser` 输出 `Ready: http://localhost:3000/`，继续服务当前仓库，不需要重建快捷方式。
- 实际浏览器验收未完成：Computer Use 无法可靠识别 Windows 浏览器当前 URL，工具停止了操作。没有继续点击、读取或迁移用户浏览器中的真实工程数据。
- 本轮未确认实际三工程存在共享，也未交付一键拆分。P0-2 后续迁移应基于恢复包，先备份，再拆分 UUID 并重映射工程内引用，不能仅修改标题。P1 四个既有旧语义 skip 仍列为待办，未伪称全产品完成。

## 最终验证输出

以下摘自最终命令的原始输出，完整内容见同目录 `P0-PROJECT-OPEN-VERIFY.log`：

```text
$env:PERF_GATE = '1'; npm run test:verify -- --no-file-parallelism

 Test Files  41 passed (41)
      Tests  446 passed | 4 skipped (450)
   Start at  11:17:24
   Duration  148.89s (transform 3.09s, setup 0ms, collect 70.04s, tests 35.20s, environment 30.85s, prepare 5.20s)

Test collection guard: 41/41 disk test files collected

perf: 500 实例搜索 三次 106.60 / 51.41 / 58.89ms → 中位数 58.89ms（预算 300ms）
perf: 20 步撤销（含工作区渲染） 三次 336.99 / 276.05 / 287.04ms → 中位数 287.04ms（预算 800ms）
```

退出码 0。原命令 `npm run test:verify` 也已跑过：`Test Files 40 passed | 1 skipped (41)`，`Tests 444 passed | 6 skipped (450)`；该命令默认跳过性能文件。最终串行命令通过既有 `PERF_GATE=1` 开关启用该文件，未修改任何测试预算或收集规则。

`npx vue-tsc --noEmit`：退出码 0，输出为空；`npm run build`：退出码 0，原文 `✓ built in 12.62s`。独立 `npm run test:perf` 也通过：`Test Files 1 passed (1)`、`Tests 2 passed (2)`。

`git diff --exit-code -- tests/arxml-interoperability.test.ts tests/arxml-fidelity.test.ts tests/catalog.test.ts`：退出码 0，零改动。`git diff --check` 通过；搜索 tests 下不存在 `it.fails` / `test.fails`。
