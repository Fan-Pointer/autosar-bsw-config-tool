# TASK-012 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-012 / 0 |
| 完成日期 | 2026-11-04（实现与浏览器检查自 11-03 开始） |
| 契约 | ACTIVE v2；SHA-256 `bb9020f243f43a9022f8df83a114268e5eb3791973d35ceb1918a3b8998d6b65` |
| 基线 | `babbfd6`；业务研究基线 `1e03827` |
| 构建 | `npm run build` 通过 |
| 测试 | 265 项：194 通过、70 失败、1 跳过；新增恢复测试 15/15；相对原 250 项无新增失败 |
| 结论性质 | Codex 自检，等待 WorkBuddy 绑定提交独立评审；不是产品最终验收 |

## 交付与验收对照

| 条目 | 文件 | 实现及自检结果 |
|---|---|---|
| A1 | `src/stores/configStore.ts` | 分别恢复配置集、导入定义和模块偏好；坏记录保留 raw、名称、模块、版本、原因、时间。重复配置 UUID、冲突定义、无效结构隔离；库扩展字段保留。普通加载不写原库。 |
| A2 | 同上 | 检出隔离后先写永久快照，再写 sidecar 锁；快照/sidecar 配额失败仍内存锁定并告警。快照挂起期间 recovering guard 也拒绝写入。重启重用匹配快照，不轮转。 |
| A3 | 同上；配置集、模块管理、导入、搜索调用点 | 唯一 assertWritable 守卫正常原库写路径；初始化前后均复核。锁定时新建及保存草稿仅写独立 draft key；兼容集可浏览编辑，保存明确拒绝。 |
| A4 | 同上 | 兼容库加载零写入、零快照；普通保存增加 schemaVersion:4，保留库扩展字段。未做解锁或跨版本迁移。 |
| A5 | 同上 | 导出分离的 rawJson、sidecar、快照键索引、备份索引，并额外带 draftLibrary，原库与草稿不会混装成可覆盖库。单测深度相等；真实下载包成功解析。 |
| B1 | `src/ui/ConfigSets/RecoveryPanel.vue`、`src/views/{HomeView,WorkspaceView}.vue` | 两个页面均挂载保护横幅，四动作可用；折叠后仍显式显示原库保存已锁定。 |
| B2 | RecoveryPanel | 隔离列表含逐条原因与快照；删除按钮须先发起导出，并经过“确认文件可用”和“永久删除”两次确认。只删指定快照、不解锁原库。 |
| B3 | RecoveryPanel、`bswmd/legacy/dem_bswmd_4.2.2.json` | 本轮已完成：从 `819eb12^:bswmd/dem_bswmd.json` 恢复准确历史资产，以独立 loader 和脱离活动编辑器的副本只读浏览。零映射，编辑/保存/业务导出禁用。 |
| B4 | `ConfigSetManager.vue`、`ImportDialog.vue`、`ModuleManager.vue`、`GlobalSearch.vue`、WorkspaceView | 所有相关异步拒写明确捕获反馈 DATA_LOCKED；不再给出普通保存成功。草稿保存明确说明原库仍锁定。 |
| B5 | store / RecoveryPanel | 重载保留隔离、锁和独立草稿；草稿列表可重新选中。单测重建 store，浏览器刷新后实查。 |
| C1 | `tests/recovery.test.ts` | 15 项新测试覆盖混合库、坏定义/偏好/重复 UUID、坏整库、v2 来源、配额异常、快照永久性与并发保护、原样包、准确只读、兼容路径、草稿恢复和初始化后写锁复核。 |
| C2 | 既有测试零修改 | 基线 179 pass/70 fail/1 skip；本轮 194 pass/70 fail/1 skip。按 fullName 比较新增失败列表为空。 |

`src/core/**` 零改动；未修改 stage、评审、契约；无新增 any、忽略类型检查或测试删改。

## 修复前后的故障链

研究基线在已有 Dem 4.2.2 库上报 `BSWMD module not found: Dem (4.2.2)`，加载失败可能使内存与原库脱节。旧设计用 legacy-map 改写字段不能解决语义兼容：J1939 节点和 DTC 严重度、立即持久化和老化允许并非同一概念。

本轮依 WorkBuddy 修订设计，失配记录只隔离：正常记录继续恢复，原库冻结，准确旧定义只供只读取回，工作可另存草稿。新建/导入前初始化、并发加载中的保存、未先读取存储的直接保存，均不能绕过保护。只读视图明确历史资产不是官方 4.4.0 定义。

## 存储键和数据边界

| 键 | 行为 |
|---|---|
| `autosar-config-sets-v3` | 主库。锁定期间零写入；普通加载零写入。 |
| `autosar-config-v2` | 旧单配置来源；无 v3 时读取，失配时也保留并标明导出 sourceKey。 |
| `autosar-recovery-state` | 独立 sidecar：锁、原因、快照键、隔离原始记录、来源及草稿键。 |
| `autosar-recovery-snapshot-<ISO>-<UUID>` | 原库原始值的永久快照；非环形备份。追加 UUID 避免同毫秒冲突。 |
| `autosar-config-sets-v4-draft` | 独立草稿库；刷新后恢复，异常草稿也隔离并停止覆盖。 |

原始 JSON 导出不受业务完整性校验阻拦。`rawJson` 与当前原库值深度相等；`draftLibrary` 独立携带，不更改原始值。永久快照写入失败时不会因“备份失败”放行原库写入。sidecar 失败时保留本轮锁，下一次加载重新检测，界面明确告警。

## 自动验证

命令：`node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=.temp/task012-tests.json`

实际 JSON 统计：`numTotalTests=265, numPassedTests=194, numFailedTests=70, numPendingTests=1`；退出码 1 来自原有 70 项失败。原文保存在 `.temp/task012-tests.json`，SHA-256：`086c66469dda9f604cc953901623dd6eccb8eb6cdbffd06052d2cd4f36920a16`。汇总及失败差分见 `evidence/task012/test-summary.json`。

`npm run build`：vue-tsc 与 Vite 5.4.21 通过，1862 modules，17.97s。主包 1186.67 kB、gzip 381.48 kB，仍有 >500kB 警告（S7 性能工作，未宣称解决）。`git diff --check` 通过；`git diff --numstat -- src/core` 无输出。

## 真实浏览器验证

使用隔离来源 `http://localhost:3001`，与用户 `http://127.0.0.1:3000` 的存储分离。构造一份 4.2.2、一份 4.4.0 配置和扩展字段，仅允许空库初始化。复现入口 `.temp/recovery-fixture.html` / `.temp/recovery-fixture.ts` 为本机验证工具，评审方可直接检查和运行；可重复的机制断言已在提交的 tests/recovery.test.ts 中。

1. 打开 `/workspace`：显示 1 个隔离记录，兼容配置正常浏览；保存显示 DATA_LOCKED。
2. 隔离详情显示旧模块/版本及快照；只读打开后实查 `DemJ1939DTC_J1939NodeRef=J1939_NODE_KEEP`、`DemImmediateNvStorage=true`，均已配置。没有变成 Severity/AgingAllowed。
3. 关闭只读、折叠保护条后，锁定标识仍在；新建“恢复验收独立草稿”成功。刷新后隔离与锁仍在，列表包含兼容集和独立草稿，草稿可打开。
4. 页面按钮导出，取得真实文件 `C:/Users/Pointer/Downloads/autosar-raw-recovery-1793703691806.json`（64,879 bytes）。解析见两份原配置、1 隔离记录、1 草稿及 `unknownExtension.note=RETAIN_FIXTURE`。旧 raw 和草稿与浏览器不变量记录深度相等。
5. 验证工具读取该隔离来源，呈现 `originalUnchanged=true`、`snapshotMatches=true`、`recovery.locked=true`，草稿数量 1。

证据：

- `evidence/task012/readonly-j1939.jpg`：实际只读窗口截图。
- `evidence/task012/readonly-values.dom.txt`：只读原值及禁用控件 DOM。
- `evidence/task012/storage-invariants.json`：浏览器检查按钮的实际呈现结果（全部为构造数据）。
- `evidence/task012/download-check.json`：真实下载 SHA-256、结构、原值/草稿比对结果。

未在用户真实库上故意复现覆盖；未通过 UI 永久删除快照。删除逻辑和两层确认已代码检查，错误快照键拒绝有单测；实际永久删除需用户确认，不将“未点击”记为实测通过。浏览器自动化下载接口发生长时间等待，最终取得文件；这不是产品响应速度测量证据。

## 限制与后续

- S1 保护与取回已完成自检，仍待独立评审；不能据此宣称整个产品可交付。
- S2 必须修复当前 70 项旧测试失败；本轮未降低或删除断言。
- 历史只读仅覆盖当前可确认的 Git 历史 Dem 4.2.2；其他无法匹配记录可原样取回，明确失败原因，不猜定义。
- 原库解锁、迁移预览、写回以及不映射字段处理属于 S6；本轮没有自动迁移。没有环形常规备份。
- 兼容条目在保护状态下可在内存编辑，但无法保存回冻结原库；可取回当前 JSON 或另建独立草稿。提示应保留。
- 命名空间、业务输出闸门、第三方工具导入验证未在 S1 修复或声称通过，按 S3 与既定范围继续。
- 无需用户新增范围决定。请求 WorkBuddy 对此提交独立复测，结论绑定任务/round/SHA；通过后按既有路线下发 S2 契约。
