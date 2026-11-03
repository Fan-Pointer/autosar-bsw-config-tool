# 当前产品核验

日期 2026-11-03；代码基线 `1e03827`。研究者 Codex。本文不是独立评审或完成声明。

## 证据口径

**事实/实测**指真实浏览器操作或已执行命令；**代码事实**只证明实现存在；**风险推断**需用例复现；**建议**交 WorkBuddy 定稿。历史 APPROVED 仅对当时提交有效。

“已可用”限定为本次实际通过的动作；“部分实现”包含未覆盖的组合和已发现缺陷；“只有界面”指入口/占位没有执行结果；“尚未实现”需代码和现有需求共同核对。

## 本次运行记录

原入口 `127.0.0.1:3000` 旧库加载失败，详见 00-STATUS。隔离入口 `localhost:3000/workspace` 新建 `研究验证_20261103`，没有清空原 origin 数据。开发服务 Vite 5.4.21；生产构建通过，250 项测试中 70 失败，不能发布。

| 编号 | 实际操作 | 结果与边界 |
|---|---|---|
| L01 | 空库→配置集管理→新建→Dem→填写名称→创建并打开 | 成功；两顶级页签 DemConfigSet/DemGeneral，必需子实例自动创建 |
| L02 | DemGeneral 的 DemDevErrorDetect 开启、DemTaskTime=0.01→保存→刷新→重开该页签 | 值仍为 true/0.01；说明这两个字段及新库持久化可用，不证明旧库兼容 |
| L03 | 点击代码验证 | 列出 DemOperationCycleRef、DemEventMemorySetRef、未选 CHOICE 三项；问题按钮可定位字段 |
| L04 | 错误定位→选择 DemOperationCycleRef→DemGeneral/DemOperationCycle | 选择后立即提交，弹窗关闭；没有确认/取消暂存步骤。撤销清空引用，重做恢复；首次点击被弹窗关闭动画吸收，待关闭后重验通过 |
| L05 | 定位 CHOICE→选择 DemDebounceMonitorInternal | 出现候选实例，按钮 pressed；两个候选没有被同时实例化。切换其他候选数据保留策略尚未实测 |
| L06 | DemClient 选择 DemGeneral/DemEventMemorySet | 引用成功；再次验证显示“验证通过” |
| L07 | 一键确认建议值 | 提示已确认 10 项，剩余 28 个必填参数需手填；该提示与树“必填齐全”并不一致 |
| L08 | 工程名称右键→导出→ARXML | 拒绝：列出 28 个未显式配置的必填参数。此前“验证通过”不代表可导出，是已复现缺陷 |
| L09 | 同一路径导出 JSON | 下载成功：`C:/Users/Pointer/Downloads/研究验证_20261103.json`，JSON 可解析且 format=autosar-bsw-config。不是完整工程备份：定义库与其他配置集不在该单集导出内 |

浏览器证据：`evidence/local-legacy-load-error.dom.txt`、`local-export-after-validation.dom.txt`、`local-official-dem.jpg`。L02/L04/L06 的值和状态通过工具观察；操作记录不可等同性能测量。参考站调用经常每次 20 秒，下载事件工具曾等待约 9 分钟，不能归为应用处理耗时。

## 功能完成度与代码定位

| 能力 | 当前结论 | 代码事实、主要限制 |
|---|---|---|
| 新建/打开/保存新配置集 | 已可用（L01/L02） | `src/ui/ConfigSets/ConfigSetManager.vue`、`src/stores/configStore.ts`；新建需先开管理面板再开对话框，步骤可减 |
| 克隆/删除/多集切换 | 部分实现 | store 有独立 uuid 克隆、持久化、切换前保存；lifecycle 8 个失败，当前版本组合需回归 |
| 旧数据恢复 | 部分实现且 P0 缺陷 | `configStore.ts:795` 任一版本不匹配整库失败；无恢复区，写入可能覆盖未恢复数据 |
| 30 秒自动保存 | 尚未实现 | Workspace 仅手动、离开路由保存和 beforeunload 警告；没有定时保存 |
| 官方定义加载 | 部分实现 | `bswmd/dem_bswmd.json`、`EcucArxmlImporter.ts`、ModuleManager 的 Worker 导入；Dem 67 容器/162 参数/64 引用；不是全部 BSW 模块随产品提供 |
| 参数表单 | 部分实现 | `src/ui/FormEditor/DynamicForm.vue` 六类型、进制、可选启用、范围；默认建议值看起来像已配置，FLOAT 也出现 HEX，缺少长说明的明显入口 |
| 容器生命周期/CHOICE | 部分实现 | `ConfigInstance.ts`、`ChoiceSelection.ts`、`ContainerActions.vue`；选择已实测，复杂克隆/删除引用/排序待回归 |
| 普通内部引用 | 已可用（L04/L06） | 当前同一配置集内目标定位与撤销可用；弹窗立即应用，长路径拥挤 |
| 多候选/多重/外部引用 | 部分实现 | 元数据有 destinationRefs[]/kind/isExternal；store 和 DefinitionConstraints 只按首个 destinationRef 过滤；值模型仅单 targetUuid；不能声称多重引用/外部目标已支持 |
| 校验/问题定位 | 部分实现且 P0 缺陷 | `DefinitionConstraints.ts` 检查类型/值域/引用，忽略 isConfigured 导致 L08；`src/modules/dem/DemConstraints.ts` 为模块规则，不能宣称覆盖完整 Dem SWS |
| 撤销/重做/批量 | 部分实现 | `HistoryStack.ts`、`ConfigDelta.ts`、BatchEditPanel；单引用撤销已测，20 步/跨集/批量当前版本需回归 |
| 搜索 | 部分实现 | `ConfigSearch.ts`、GlobalSearch，按名称/值/路径；索引全量重建；尚无本轮大规模响应数据 |
| JSON 导入导出 | 部分实现 | `ConfigJson.ts`、`ImportPlan.ts`、ImportDialog；L09 下载成功，预览/冲突/原子提交有代码及历史证据；本轮导入回读待验证 |
| ARXML 导入导出 | 部分实现且 P0 兼容缺陷 | `Arxml.ts` 仅认 r4.2.2 namespace、单模块、内部目标；DEFINITION-REF 前缀写死；引用 DEST 全写 ECUC-REFERENCE-DEF；不是 CP 4.4.0 互操作通过 |
| CSV DTC 表 | 部分实现 | `Csv.ts` 利用 exportRole，官方 JSON 已带 6 处角色；本轮尚未构造完整 DTC 行验证 |
| C 配置代码 | 部分实现 | `CGenerator.ts` 通用常量/结构，非供应商 ABI；遍历全部参数、忽略 isConfigured 并回退 defaultValue，可能把建议值生成正式值；应与导出共用有效性闸门 |
| 导入安全/错误处理 | 部分实现 | XML 声明/实体/XInclude/大小/深度限制已存在；错误多数瞬时 toast 或英文，部分测试仍红，需保留既有安全断言 |
| 模块管理 | 部分实现 | 左右搬运、按模块设置生成/验证；同名定义冲突拒绝，配置集单模块；不是多模块工程语义 |
| RTE/输入输出文件目录 | 只有界面 | Workspace 资源分支占位，无对应编辑业务；应隐藏或准确显示支持边界 |
| 新建/工程管理/自动计算右键项 | 只有界面 | `menuItems` disabled，提示“未核实，待补充截图”，是开发过程术语，应从产品中移除 |
| `/wizard`、`/import-export` 路由 | 只有界面 | 两 View 写“功能开发中”；实际导入在工作区右键菜单，造成重复入口 |
| 引用图/拖拽排序 | 尚未实现完整功能 | 已装 Vue Flow 不等于引用图完成；排序按钮禁用；按既有需求在设计中明确处置 |
| 主题/缩放 | 部分实现 | 亮暗主题、分栏尺寸存在；1280×720 已运行，窄屏/键盘/长文本/200% 缩放未验收 |
| 离线交付/使用说明/样例 | 部分实现 | 有 build/preview，但 README 仍写 Phase2、4.2.2；无可直接走通最终输出的官方 4.4.0 示例交付 |

## 数据与扩展边界

现有 ConfigInstance 是一个模块配置集：uuid、moduleRef、version、containers、createdAt/lastModified。容器保存 definitionRef、参数和引用 Map、子容器；引用只有 targetUuid。LocalForage `autosar-config-sets-v3` 保存配置集列表、模块定义、偏好。应保留这套已有有效结构，显式扩充恢复信息与序列化版本，不把页面叫“工程”就推导成多模块工程。

定义导入/遍历/校验/生成置于纯 TS core；Pinia 负责会话与存储；UI 由元数据驱动。新模块仍通过定义注册，专用业务语义在 modules 层。数据库 schema 版本、AUTOSAR release、定义来源 hash 必须分开表达。

## 必须纠正的迁移假设

`tests/helpers/legacy-map.json` 是测试替换设施，**不是无损迁移表**。实际包含 `ecuc-dem-dtc-j1939-node-ref → DemDTCSeverity`（字符串/节点语义变成严重性枚举）以及 `ecuc-dem-attr-immediate-nv → DemAgingAllowed`（语义不同的布尔属性），且多旧 id 指向同一新 id。

因此 WorkBuddy S0 草案 D5 的“47/47 映射即可产品化”会造成语义损坏。建议：S0 先隔离、原样备份、写保护和恢复准确版本定义的路径；旧手写定义从 Git 保留的历史版本恢复，只读展示可先于迁移。跨版本迁移仅对经审查的同义字段提议，差异预览必须列出改名、层级变化、类型/枚举变化、无法映射项；未经确认的值留原档案，不可冒充迁移成功。

## 性能与可靠性待验收

build 主包 1186.66 kB 是实际产物大小，不能当响应速度。后续固定机器/浏览器/构建模式/数据规模记录：首屏可操作、1000 DTC 和 5000 实例展开/搜索/编辑、JSON/ARXML 导出；报告 p50/p95 或明确小样本次数。低于目标再优化，有效功能优先。自动闭环在设计 READY 前保持无实现进程，避免并发写库和重复任务。
