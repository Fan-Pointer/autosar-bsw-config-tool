# 产品研究：证据与进度

日期：2026-11-03。负责人：Codex。状态：研究基线和 G01–G30 差异清单已交 WorkBuddy 设计定稿，尚未进入业务实现。未验证功能继续保留明确标记。

## 基线

- 业务代码：`1e03827c10722e0f45d98acd5774454e9030f325`。WorkBuddy 随后独立提交规划确认 `3b67442`，不改变业务代码。
- 已阅读 AGENTS、DIVISION-OF-WORK、PROTOCOL、STATE、ACTIVE、README、REQUIREMENTS、ARCHITECTURE-v2、FEATURE-MATRIX、历史评审与 TASK-011 交接。
- `npm run build`：通过。Vite 5.4.21，18.16 秒；主 JS 1186.66 kB（gzip 381.48 kB），存在大包警告。这里是构建耗时，不能当页面响应速度。
- `npm test -- --run --reporter=json --outputFile=.temp/baseline-20261103-tests.json`：250 项，179 通过、70 失败、1 跳过。旧 fixture 与官方定义切换有关，但不能把全部失败未经分析都归为测试过时。
- 调度器原先因 `IN_PROGRESS` 无法识别；WorkBuddy 已改成 `BLOCKED/REPLAN_PENDING`，等待本轮研究、设计和新契约。当前不宣称自动开发已恢复。

## 实测重大问题：旧数据打不开

在用户原有 `http://127.0.0.1:3000/workspace` 存储环境启动页面，显示：

`BSWMD module not found: Dem (4.2.2)`

保存、验证、生成禁用，显示「暂无配置集」。证据见 `evidence/local-legacy-load-error.dom.txt`。未清空、编辑或保存用户原数据。

代码对应 `src/stores/configStore.ts:795`：逐配置集要求 `moduleRef + version` 精确匹配已加载定义；任一失配抛异常，整库恢复失败。现有内置 Dem 为 4.4.0。其后的创建/保存路径可能用空内存覆盖未恢复的库，须在实现阶段增加恢复失败写保护、原始备份/恢复入口、逐条隔离与显式迁移策略；不能简单改版本号或清空存储。

为避免影响原数据，后续新建流程使用 `http://localhost:3000` 独立 origin。它是测试隔离，不是原数据恢复完成的证据。

## 标准版本：纠正规划草案中的技术混淆

用户提供源文件头明确写 CP **4.4.0**、`xmlns=http://autosar.org/schema/r4.0`、`AUTOSAR_00046.xsd`。因此 r4.0 是命名空间，4.4.0 是发布版本，两者不矛盾。

现有 `src/core/io/Arxml.ts:12` 使用 `http://autosar.org/schema/r4.2.2`，不能因为旧 fixtures 使用相同字符串就判定符合标准。WorkBuddy ACK §五 Q4 的「统一 r4.2.2」建议应撤回，先区分发布版本、schema 标识和命名空间。

- 官方序列化规则 CP R19-11，`TPS_ASR_00011/00017`：兼容版本沿用 r4.0 命名空间。来源：https://www.autosar.org/fileadmin/standards/R19-11/CP/AUTOSAR_TPS_ARXMLSerializationRules.pdf （搜索索引取得条款；整份 PDF 本轮获取超时，待进一步核对）。
- 官方 ECU 配置规范 CP **4.4.0**，`TPS_ECUC_03020` / Example 2.33：CHOICE 值侧采用普通容器值、定义引用指向 CHOICE 定义。来源：https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ECUConfiguration.pdf （已取得官方 PDF）。不把较新规范冒充 4.2.2。

## 范围确认

用户于本轮明确确认：以现有官方定义 **CP 4.4.0** 为验收基线；本期先完成**单一配置方案**，配置变体后续再做；暂无 DaVinci/供应商环境，先验收**标准文件与通用可编译代码**，明确未验证供应商集成。旧 4.2.2 用户数据保护与恢复仍是升级责任，不因新基线而丢弃。

向导形态、主包拆分、云端菜单不照搬属于常规设计裁量：保留新手完成任务的引导目标，具体形态由设计决定；纯前端离线边界继续沿用。未观察到参考站某能力不等于该能力不存在。

## 已有参考证据

真实登录态观察与图片在 `.codex/references/easysar-2026-11-03/`。旧 FEATURE-MATRIX 的 i18n 推测不能作为已验证能力。完整观察索引见 02，未测能力不据菜单名称补全。

## 设计交接

2026-11-03 18:00（本机时区），通过指定 WorkBuddy 原生任务实际发送 `PRODUCT_RESEARCH_HANDOFF_20261103`，消息已出现于对话且 WorkBuddy 进入处理状态。交接正文见 `.codex/reports/PRODUCT-RESEARCH-HANDOFF-20261103.md`。这证明请求已送达，不表示设计完成或任务通过。

明确要求撤回 S0 草案直接产品化 `legacy-map` 的方案：其中 J1939 节点→严重性、ImmediateNv→AgingAllowed 等替换不保持语义。由 WorkBuddy 独立修正设计、完成需求与阶段契约，再下发 READY；Codex 不自行修改阶段或宣告评审通过。
