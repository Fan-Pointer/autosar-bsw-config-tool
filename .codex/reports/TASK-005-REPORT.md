# TASK-005 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-005 / 0 |
| 完成日期 | 2026-11-01，Asia/Shanghai |
| 本轮事件 | `2a81c4e14adedc3c9af8fc7e`，implement |
| 基线 | `ec7c64889403ab00578f9496d203a4b95bceb604`，WorkBuddy 已完成本地提交、同步和释放写入权 |
| 契约哈希 | `b8511000f0564c40aef33cfc963a9a7442d55d3403a12c863d51507c4bdeaa08`，核验匹配，未修改 |
| 构建 | `npm run build`：vue-tsc 严格检查和 Vite 生产构建通过 |
| 测试 | `npm test -- --run`：127 passed / 6 files / 0 skipped；原 83 项保留，新增 44 项 |
| 独立评审 | 待 WorkBuddy。本报告仅记录 Codex 实现和自检，不作批准或阶段推进决定 |
| 版本绑定 | 先提交本报告与本轮实现，再由单独的 STATE 提交绑定完整代码 SHA |

## 交付文件

| 文件 | 状态 | 内容 |
|---|---|---|
| `src/core/io/IoTypes.ts` | 新建 | 文件格式、序列化结构、预览会话与冲突行类型 |
| `src/core/io/ConfigJson.ts` | 新建 | 完整 JSON 快照、未知输入校验、定义树校验、50 MB 上限 |
| `src/core/io/Arxml.ts` | 新建 | r4.2.2 ECUC 值导入导出、定义路径、UUID、两遍引用解析、DTD 拦截 |
| `src/core/io/Csv.ts` | 新建 | BSWMD 语义角色驱动 DTC 列表，BOM、十六进制、CSV 转义 |
| `src/core/io/ImportPlan.ts` | 新建 | 按实例路径对比、覆盖/跳过/重命名、统计、引用映射与上限约束 |
| `src/core/bswmd/BswmdTypes.ts`、`BswmdParser.ts` | 修改 | 解析并校验可选 `exportRole` 元数据 |
| `bswmd/dem_bswmd.json` | 修改 | 为 DTC 值、严重度、WWH-OBD、EventId 和两种引用标注导出角色 |
| `src/stores/configStore.ts` | 修改 | 解析/预览/应用/导出接线；快照绑定、独立候选、单次本机持久化、失败保留原配置 |
| `src/ui/ImportExport/ImportDialog.vue` | 新建 | 本机文件选择、导入目标、四列对比、三策略、四项计数、确认/取消 |
| `src/views/WorkspaceView.vue` | 修改 | 工程右键两级导入导出菜单；模块/配置集 tooltip；底部竖排折叠添加入口 |
| `src/ui/FormEditor/DynamicForm.vue` | 修改 | 固定控件列宽度内右对齐 |
| `tests/io.test.ts`、`tests/io-ui.test.ts` | 新建 | 27 项核心 / 安全用例与 17 项事务 / Vue DOM 交互用例 |
| `tests/fixtures/external-entity.arxml` | 新建 | 含 file 外部实体的攻击样本 |
| `tests/replica.test.ts`、`tests/ui.test.ts` | 修改 | 按本轮启用导入菜单和折叠添加入口更新既有断言，未删除或跳过任何测试 |

## 验收标准自检

以下 UI 交互证据来自挂载真实 Vue 组件、Element Plus、Pinia、FileReader 的 Vitest/jsdom 测试；不将它们称为真实浏览器验收。

### 功能

- [x] 导出 JSON → 空配置库新建导入 → 逐项比对全部容器、参数和引用：深相等，保存/重新加载后仍一致；另测导入到已有默认根的新配置集。
- [x] 导出 ARXML → 独立 DOMParser 解析：根命名空间 r4.2.2，规定的 ECUC 层级存在，全部容器/参数值有 UUID，DEFINITION-REF 指向 `/AUTOSAR/EcucDefs/Dem/...`。
- [x] 导出 CSV → 两条 DTC 得到三行，开头 U+FEFF，DTC 值为 `0x1A2B3C` / `0x000001`，字段含 Attributes 名、EventId。
- [x] 同实例路径不同参数值 → 预览冲突数为 1，列序严格为「冲突实例路径 | 参数名 | 文件生成值 / 文件引用值 | 工程配置值 / 工程引用值」。引用冲突显示两侧实例路径。
- [x] 覆盖 / 跳过 / 重命名 → 核心和可见组件控件均实测；重命名保留原实例，新增 UUID，正确映射导入引用。
- [x] 导入中间失败 → 解析后向会话注入损坏参数对象、存储拒绝、写入等待中断均保持原配置；错误以中文提示呈现。

### 安全

- [x] 含 `<!DOCTYPE ... SYSTEM ...>`、内部实体、裸 `<!ENTITY` 的 XML 在 XMLValidator/XMLParser 之前拒绝。
- [x] 外部实体攻击样本使用实际临时 secret 文件和 `file:///` URL；断言解析器、文件读取、fetch 均未被调用，结果未包含 secret。
- [x] 文件选择阶段对 `File.size` 检查，超过 50 MB 不调用 FileReader；JSON/ARXML API 再按 UTF-8 字节数检查，中文多字节超限同样拒绝。
- [x] 解析异常捕获为可读错误。Vue 模板插值将恶意 `<img ...>` 显示为文字，DOM 中没有新增 img。
- [x] 源码和测试无 `any`、`@ts-ignore`、`eval(`、`innerHTML =`。

### 工程

- [x] `npm run build` 通过，未关闭 strict 或类型检查。
- [x] `npm test -- --run` 127 项全绿，≥83，GCC 用例本轮也实际执行通过。
- [x] `src/core/` 无 vue / pinia / element-plus。
- [x] `src/ui/`、`src/views/` 无 CanIf / DemDtc 具体模块字段。
- [x] 导入导出均在本机处理，无后端、网络传输或新依赖。
- [x] 未修改契约、review、stage、调度代码、参考图或下一阶段范围。

### 交付清单补充核对

| 契约编号 | 结果 |
|---|---|
| A1–4 | JSON/ARXML/CSV 三种本机下载，工程右键导出子菜单启用；无活动配置时禁止导出 |
| B5–10 | JSON/ARXML 两种文件预览；四项计数、四列表、默认覆盖、三策略；确认后单次提交本机配置库；取消无写入 |
| C11–14 | DTD/实体拦截、文件大小和深度上限、无执行/HTML 注入、统一错误提示 |
| D15（🟠-1） | 工具栏 ＋ 保持主入口；表单底部为默认折叠的「＋ 添加子容器」，展开为竖排带 ＋ 按钮，间距 12px |
| D16（🟡-1） | 模块页签 title 分行显示「模块：… / 配置集：…」，组件断言通过 |
| D17（🟡-2） | 控件列维持 270px / 小视口 240px，flex 右对齐，开关与输入/下拉共享右边界；像素级浏览器复核受权限限制 |

## JSON round-trip 逐项比对

复现用例：`lossless JSON import/export > round-trips every metadata field, UUID, definitionRef, parameter state and reference through a new set`。

| 项目 | 原始数据 | 重新导入 | 比对方式 |
|---|---|---|---|
| 配置元数据 | uuid、name（中文）、moduleRef、version、createdAt、lastModified | 全部保留 | 对整个 ConfigInstance 深相等；稳定 JSON 文本相等 |
| 容器 | 7 个，含父子路径、UUID、definitionRef、shortName、description | 7 个，逐个相同 | 按路径逐实例深相等 |
| 参数 | 31 个 Map 项，BOOLEAN / INTEGER / FLOAT / ENUM / STRING；含 1 个显式禁用值 undefined | 31 项，值和 isConfigured 全相同 | 每个参数 Map 深相等；Map 对象相互独立 |
| 引用 | 9 个 Map 项，3 个实际目标和 6 个空目标 | 全部 targetUuid 相同 | 每个引用 Map 深相等 |
| 特殊字符 | 中文、`< > &`、双引号 | 原样还原 | 精确字符串比较 |
| 持久化 | 空库导入后保存 | loadConfig 后一致 | JSON 文本再次相等 |
| 合并到默认根 | 新配置集有不同根 UUID | 保留目标根身份，按路径合并后容器/参数/引用关系相同 | 参数逐项及引用目标路径逐项比较 |

## ARXML 断言输出

`tests/io.test.ts` 中独立 DOMParser 与导入器共同验证：

```text
parsererror = null
AUTOSAR.namespaceURI = http://autosar.org/schema/r4.2.2
AUTOSAR > AR-PACKAGES > AR-PACKAGE > ELEMENTS > ECUC-MODULE-CONFIGURATION-VALUES 存在
ECUC-CONTAINER-VALUE = 7，全部有 UUID
ECUC-NUMERICAL-PARAM-VALUE + ECUC-TEXTUAL-PARAM-VALUE = 31，全部有 UUID
所有输出 UUID 唯一
全部 DEFINITION-REF 以 /AUTOSAR/EcucDefs/Dem 开头
再次导入后参数按 definitionRef 逐值相等，非空引用目标 UUID 相等
带命名空间前缀的文档 / 缺省 UUID / XML 转义与空白保留：通过
```

## XXE 测试输出

```text
external-entity.arxml → 替换 SYSTEM 为实际临时 secret 文件 URL
抛错：禁止 DTD / DOCTYPE 与外部实体，文件未被解析
XMLParser.parse calls = 0
fs.readFileSync calls = 0（攻击样本读取完成后开始监测）
fetch calls = 0
result = undefined；外部 secret 未进入结果
外部网络 DTD / 内部实体展开 / 裸 ENTITY / 超深 XML：全部拒绝
```

这些计数是测试断言通过的结果；不是声称完成了通用 XML Schema 一致性或渗透测试认证。

## 三种冲突策略实测记录

测试经 FileReader 选择 JSON 文件，原工程 DTC 参数值 1，文件值 42。先断言四列表和覆盖默认选中，再点单选项和「应用导入」。

| 策略 | 预览 | 应用结果 | 保存重新加载 |
|---|---|---|---|
| 覆盖 | 冲突 1，文件 42 / 工程 1，新增 0 | 同 UUID 的实例变为 42 | 保持 42 |
| 跳过 | 冲突 1，新增 0 | 原实例保持 1 | 保持 1 |
| 重命名 | 冲突 1，新增容器 1、参数 5 | 原实例保持 1；新增 `DemDTC_2` 值 42、独立 UUID | 两个实例均保留 |

其他核验：克隆文件即使 UUID 全不同，只要实例路径及值相同不会误报引用冲突；重命名后内部/跨兄弟导入引用正确映射；原工程未参与导入的引用保持原值。达到 BSWMD 上限时重命名候选直接拒绝，不修改工程。预览和应用复用同一候选身份，避免 UUID 在确认时漂移。

## 关键实现说明

1. **事务边界**：保留实时配置库快照，解析、类型检查、冲突合并、上限检查、规则验证都在独立候选上完成；本机存储以一次 `setItem` 原子写入完整配置库，成功后才发布到 Pinia。异常路径没有半截实时配置需要清理；失败时配置、选中项、dirty 标记、旧存储内容保持原状。导入写入期间禁止编辑入口，预览后工程被改则要求重新预览。
2. **合并语义**：按父路径和实例 shortName 匹配。覆盖替换匹配实例的字段，递归合并子容器，文件未列出的工程容器保留；删除计数统计被覆盖实例中被移除的参数/引用。跳过保留有冲突实例及其子树；重命名以 `_2`、`_3` 并入整个冲突子树。UI 明示这些语义。
3. **文件范围**：每个文件对应一个活动模块配置集。JSON 为 `format=autosar-bsw-config`、`formatVersion=1` 的完整快照；新建导入保留文件元数据，同库已有同 set UUID 时仅为新 set 分配新 UUID。合并当前集保留当前集名称/身份并更新修改时间。
4. **ARXML**：使用已加载 BSWMD 解析 ECUC 实例值，不把值文件当定义文件。支持单模块配置、嵌套包、默认/带前缀命名空间和缺省 UUID；数值按 BSWMD 类型转换。未提供的 XML 参数保持未配置，不恢复默认值；引用第二遍解析支持前向引用。文件不含引用目标时明确拒绝，JSON 则可原样保存既有悬空 UUID 供现有校验器诊断。
5. **模块可插拔**：CSV 读取参数/引用的可选 exportRole 元数据，与实例/定义字段名称解耦。测试改名后仍正确取值。多个 EventId 使用分号放在同一个 DTC 行；标准 CSV 引号转义，并将公式样式文本转为字面值。
6. **安全上限**：文件最大 50×1024×1024 字节；配置容器递归深度 128；XML 解析前最大标签深度 300。先拒绝 DTD/ENTITY，再运行 XMLValidator/XMLParser，保留 XML 内建转义能力。

## 自检命令输出

```text
npm run build
vue-tsc --noEmit && vite build
✓ 1829 modules transformed.
✓ built in 11.40s
既有主包约 1.18 MB，Vite >500 kB chunk warning 仍在；不是构建失败。

npm test -- --run
✓ tests/core.test.ts (45 tests)
✓ tests/lifecycle.test.ts (15 tests)
✓ tests/io.test.ts (27 tests)
✓ tests/replica.test.ts (8 tests)
✓ tests/io-ui.test.ts (17 tests)
✓ tests/ui.test.ts (15 tests)
Test Files 6 passed (6)
Tests 127 passed (127)
最终运行 03:01:59（Asia/Shanghai），Duration 9.31s
本机完整日志：.temp/TASK-005-build.log / .temp/TASK-005-tests.log（不入 Git）

rg -n 'vue|pinia|element-plus' src/core
OK: no matches
rg -ni 'CanIf|DemDtc' src/ui src/views
OK: no matches
rg -n '\bany\b|@ts-ignore|eval\(|innerHTML\s*=' src tests
OK: no matches
git diff --check
无补丁空白错误（仅 Git 的 LF/CRLF 提示）
```

首次沙箱内构建被 esbuild 子进程 `spawn EPERM` 阻止，随后通过受控权限申请运行构建/测试成功，没有使用绕过选项。

## 待确认与环境阻塞

| 项 | 实际状态 / 处理人 / 恢复条件 |
|---|---|
| 真实浏览器复核 | 本轮 `cua.getState()` 返回 `browsers: []` 和 `Browsers: Error: Local browser use is disabled in Work settings`。已停止浏览器路径，未启动替代浏览器或绕过设置。处理人：用户 / 父会话；恢复条件：正常授权本地浏览器访问后再操作。按本轮用户要求，事件回执须明确标记这项权限阻塞；不伪称 GUI 验证成功。 |
| 已有界面展示要求 | `user-preferences.json` 记录已由父对话打开并保留 `http://127.0.0.1:3000/workspace`，openUiAfterNextImplementation=false。本 worker 未启动或遗留常驻服务，原预览继续由父调度层管理。 |
| 独立验收 | WorkBuddy 按当前 TASK-005 / round 0 / submissionCommit 执行；本 worker 不发送下一事件、不改 review/stage、不代作评审。 |

TASK-006/007 的撤销重做、批量修改、全局搜索、暗色主题、引用图、引用选择弹窗、自动计算、首页工程列表、性能/跨浏览器/新手引导仍属后续任务，本轮没有声称完成。
