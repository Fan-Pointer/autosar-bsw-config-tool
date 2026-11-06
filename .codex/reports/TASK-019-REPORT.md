# TASK-019 交付报告 · round 0

Codex 实现自检，非独立评审。当前契约哈希 `0bb62d5d2427cb0e85a6c0ab69ce9af826775e288c5333ccdce515aaa2c45c2b`。
完成时间：2026-11-06；提交 SHA 由后续 STATE.submissionCommit 绑定。

## 交付对照

| 条目 | 实现与证据 |
|---|---|
| A0 | `.gitignore` 忽略 Vite timestamp 临时文件；保留原有临时文件不混入提交 |
| A1–A3 | 三项父菜单 + 相邻单个子菜单；pointerenter 展开；父项/子项 pointerleave 300ms 延迟；子菜单进入取消延迟；键盘仍 ArrowRight/Left/Esc。DOM 断言快移不关闭、不重复、仍可点击；截图 03/04 是同一组件的键盘展开，不冒充鼠标 hover 实测 |
| B1 | 官方 4.4.0 Dem/CanIf/NvM 通过现有脚本抽取；溯源与相邻 changelog 入库；README 提供命令 |
| B2 | 工程向导直接勾选三个内置模块；模块管理的手工 ARXML 保留在高级 details |
| B3 | Vite 三份 definition 独立资源块；CanIf/NvM 动态 import，Dem 随 store 加载，均不进主 index JS |
| C1 | 独立 autosar-projects 侧表；原 ConfigSet、LIBRARY_KEY 结构、持久化与恢复协议未改；写入前 assertWritable + 原始侧表比较 |
| C2 | 工程名称、4.4.0/4.2.2待接入、S32K1XX/S32K3XX、描述 → 多选模块 → 创建。两步取消无写入测试 |
| C3 | 创建三模块并进入工作区；顶部名称/版本/芯片；工程列表切换；旧 sets 归默认工程且读取零写入 |
| C4 | 缺失 set UUID 保留并显示警告；删归属不删配置测试；索引损坏保护；写库失败补偿侧表 |
| D1–D2 | 4.2.2 仍待接入，芯片仅元信息，三模块范围明确。用户新增全库要求另见增补，未伪报完成 |
| E1–E4 | C 风格蓝白目录、航海科技/OneSAR 品牌；本机工程真实入口；知识库/订阅中心待更新路由；默认首页及桌面入口同步 |

用户在本轮验证后新增 5 点修改，见 `TASK-019-USER-ADDENDUM.md`：
首页进一步压缩（导航 56px/插图 250px/卡片缩减）；新 `/configurator` 起始页；返回首页房子图标已实现。
完整双版本目录与统一左右选择器尚未实现，需要 WorkBuddy 将旧 TASK-021 范围修订，不应据旧三模块契约宣称满足最新全部需求。

## 文件职责

- `src/views/HomeView.vue`、`ui/Portal/PortalLayout.vue`、`PendingView.vue`：品牌、产品目录、本机工程与待更新页。
- `ConfiguratorStartView.vue`、router：显式起始页，三项工程操作；有旧 activeUuid 时也不自动进编辑。
- `ui/Projects/ProjectWizard.vue`、`stores/projectMetadata.ts`、configStore 工程段：侧表与两步创建。
- `modules/builtinCatalog.ts`、`bswmd/builtin/4.4.0/*`、`vite.config.ts`：内置定义与拆包。
- `ContainerContextMenu.vue`：悬停子菜单；`ModuleManager.vue`：目录与高级手工导入。
- `WorkspaceView.vue`：工程上下文、模块作用域、品牌与首页图标；实例名输入草稿修复。
- `ImportDialog.vue`：新增可选 newOnly，起始页导入固定新建，既有工作区导入默认行为保持。
- README、index/favicon、desktop 脚本、测试与 evidence/task019。
- `src/core/**` 本轮零修改；未改 ACTIVE、stage、review。
- 期间外部新出现 `HANDOFF.md`，不是本轮产物，保持未暂存不提交。

## 数据与交互说明

工程索引先写完整 UUID 关联，再写原库；正常保存失败回滚侧表与内存。若进程在两写之间退出，
会保留孤儿关联并警告，原配置不会丢失。此为可检测/可恢复的双键写入，不宣称 IndexedDB 跨键事务。
侧表损坏、未读取或其他页改变时拒绝覆盖。移除归属仅删侧表记录；所有配置继续出现在默认工程。

模块管理仍是本机定义与全局开关；已有工程按创建时模块筛选。为避免误导，界面明示新增手工定义在默认工程使用。
按工程增减模块需要下一契约完成，已在增补要求中明确。全局生成/验证开关目前仍跨工程共享。

浏览器实操发现旧实例名输入没有可靠提交：改为独立 draft，change/blur 提交，失败恢复实际值，
相同值不重复写历史；单测覆盖原生 input→blur、保存、撤销，浏览器验证刷新保留 TASK019_Callback。

## 定义来源与体积

官方 4.4.0 源 SHA256 `c01fbd950dfbb78d7c6662582d6e41f8700d13452ac169f825198a59093209bf`，15447041 字节。
生成后用户将源重命名为父目录 `AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml`，内容与哈希不变。
生成物 $source.file 保留生成时名称；README 现用用户真实路径。

| 模块 | JSON 字节 | contentSha256 | 构建块 / gzip kB |
|---|---:|---|---|
| Dem | 220195 | 709cdde682d4a0f31f157cae3f8a0687f95f939c303e914c901d13816f72c23a | 237.02 / 29.38 |
| CanIf | 82079 | 5d82f526175322e8901d3daa7b585ce0ab4c0d3b8863df16cea74dda751b4420 | 81.68 / 11.17 |
| NvM | 41987 | 73e054fc77f108ed64f1d9a2d29168bda21b2fb0c6eedc99cceafeae75f2b0ec | 41.67 / 6.72 |

Dem diff 既有资产按 TASK-015 确定性脚本重新生成：不只是排序，包含 definitionPath、候选 refs、kind、
importWarnings 等前序解析器演进产物，精确字段变化见 bswmd/changelog.json。原既有定义 UUID 保持。
主包 1187.51 kB / gzip 381.83 kB；既有 Element Plus 大块警告仍存在，未调整阈值或关闭警告。

## 验证

- 最终 `npm run build` 通过，Vite 10.07s，包含 vue-tsc；日志 `.temp/task019-build.log`。
- 最终 `npm run test:verify`：23/23 文件守卫，**327/327 pass**，0 fail/skip；22.02s。
  基线 317 + projects 8 + 悬停 1 + 实例名草稿 1。日志 `.temp/task019-tests.log`。
- `git diff --numstat -- src/core` 空；本轮不触达标准输出核心。
- 旧 UI 断言调整：键盘进入子列表后父项现在保留，改为断言父项可见且 child-menu 仅一个；
  原功能三项、aria-disabled、never-borrows、取消零写入、键盘路径保留。无删/skip 测试。
- 中途失败如实：初测两例受隐藏向导 DOM/测试文本空白影响，修复后通过；新测试连续 checkbox change
  在 Vue 更新前派发导致漏选，逐次等待 flushPromises 后通过。未放宽产品逻辑/性能阈值。

实际浏览器（隔离 localhost:3019，保留 localhost:3000 用户库及 3001 历史恢复数据）：
1. 创建 `TASK019 三模块验收`，CP4.4.0/S32K3XX，选择全部三模块；工作区三模块可见，切 CanIf 成功。
2. 实例行右键→ArrowRight 子菜单→新增 callback；输入并保存名称，刷新后 TASK019_Callback 仍存在。
3. 第二工程仅 Dem/S32K1XX，进入后只显示该模块；回首页两工程并存。
4. 知识库与订阅中心分别打开「待更新」并返回。
5. 首页 1366/1400 截图；390 窄屏 DOM 宽375≤视口390，无横向溢出。
6. 最新压缩布局和起始页是在上述截图之后按用户增补实现，已完成 DOM/构建测试，**尚未完成新的真实浏览器复核**。
   原生操作随后仍返回 Esc 停止状态；未用旧截图冒充新布局证据。

截图 `evidence/task019/01…09`：01初版首页；02模块选择；03/04两宽度菜单；05/06两宽度首页；
07待更新；08工程属性；09窄屏。01/05/06/09反映压缩前 C 版，评审请复查当前运行效果。

桌面：执行 Install-DesktopShortcut.ps1 返回 `C:\Users\Pointer\Desktop\BSW 配置器.lnk`；
Start-Configurator.ps1 -NoBrowser -Port 3000 返回 **Ready: http://localhost:3000/**。
快捷方式直接使用当前仓库，本轮无需改系统执行策略。

## 限制与真实交接状态

- 用户新增完整模块与统一选择器要求未完成；已完成全源解析盘点（4.2.2 20/84，4.4.0 92/98），
  不能把解析通过数当作完整功能支持数。完整失败/警告表见 fullcatalog-source-inventory.json。
- 4.2.2 当前仍不能创建；官方源可用，但 Dem 的枚举规则也需扩解析器，旧 TASK-021 core 边界需修订。
- 不含 MCAL、跨模块引用编辑、配置变体、供应商集成、工程包整体导入导出；原数据保护保持。
- 本报告完成时 WorkBuddy 本轮评审与用户增补**尚未发送**；未虚报请求文件等于调用成功。
- 后台状态检查 residentListenerReady=false，未宣称常驻无人值守可用；恢复原生通道后向指定任务发送一次真实请求。
