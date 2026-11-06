# 两条测试定义轨道

- **官方集成**：`bswmd/dem_bswmd.json`（CP 4.4.0，67 个容器定义）和本目录的 `ecuc-canif.arxml` / `ecuc-nvm.arxml`。`core`、`ecuc*`、`choice*`、`arxml-fidelity` 的官方区块直接使用它们，不替换官方字段类型或多重性。`recovery` 同时使用准确历史资产与当前官方定义，验证零映射保护。
- **合成行为**：`synthetic-dem.json` 的版本固定为 `TEST-SYNTHETIC-1`。它是固定的 7 容器 / 31 参数小模型，用于克隆、历史、搜索、表单、导入冲突、XML 安全和序列化的可重复测试；不是任何 AUTOSAR 发布版本，不能导入产品目录当作官方定义。

合成模型的形状取自过去手写的编辑器测试样本，重新使用 `fixture-*` 定义 ID；它保留 `Dem` 模块名及 DTC / Aging 等少量名称，专门让现有 Dem 插件规则参加 UI 集成测试。该名字不代表其余字段与官方 Dem 语义等价。

`FixtureText` 是用于转义与批量编辑的普通 STRING；`FixtureToggle` 是可选 BOOLEAN。它们没有 J1939 / ImmediateNv 的产品语义，绝不映射为 Severity / AgingAllowed。`tests/helpers/legacy-map.json` 已在 TASK-014 删除，历史证据保留在 Git；官方元素通过 `definitionIndex.ts` 的真实路径或名称查找。旧 `map-legacy-dem-ids.mjs` 是历史调查脚本，不是测试或产品流程，禁止重新生成并使用其语义映射。

少量行为测试以 Vitest 的局部模块 mock 替换 `dem_bswmd.json?raw` **定义输入**。真实解析器、store、IO、历史栈、校验器、组件和保存故障路径均不 mock。测试隔离由 Vitest 文件隔离提供；官方测试文件不注册此替换。

数量断言：合成模型全实例化为 7 容器 / 31 参数，其中全部必填确认后输出 15 个值，16 个仍未配置；官方 Dem 初始化树为 8 实例 / 50 参数，新增一个 DTC 为 55 参数。二者分别断言，不借用旧数量宣称官方覆盖。

## TASK-021 官方枚举/符号引用片段

`ecuc-enum-symbolic-4.2.2.arxml` 与 `ecuc-enum-symbolic-4.4.0.arxml` 从用户提供的完整官方文件裁剪。
前者源 SHA256 为 `b5828bbdbf09fd5cd80eb8959742453ffc0563ea94f20d8b674aa792b4b8328c`；
后者源 SHA256 为 `c01fbd950dfbb78d7c6662582d6e41f8700d13452ac169f825198a59093209bf`（文件名 4.4.4，内容 4.4.0）。
保留 Adc/Ocu 的六处空枚举、Dem/FrTrcv 的三处枚举字段、Dem 的四处符号名引用及其祖先容器/元信息。
只删除无关模块/字段，XML 格式经 ElementTree 归一化，未改 literal、default、UUID、目标或多重性。
它们是类型回归用的部分定义，不可作为完整模块交付；完整模块集成测试读取 `bswmd/builtin/<release>/`。
`dem422-smoke.json` 是人为填写的验收样本，值不代表实际 ECU 推荐配置，绝不用于预填用户工程。
