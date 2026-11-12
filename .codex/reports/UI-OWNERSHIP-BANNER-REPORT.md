# 移除常驻归属横幅与模块置灰调查

日期：2026-11-12。基线：1976f02。用户要求：去掉截图中的工程归属横幅，解释 4.2.2/4.4.0 模块（尤其 Dcm）不可添加的原因。

## 已修改

- 先更新 HANDOFF §4 标准口径，再移除 RecoveryPanel 的常驻工程归属区域。首页、起始页、配置工作区共用组件，三处同时生效。
- 保留后台 ownershipDiagnosis、共享打开保护、工程范围引用检查及原始数据导出内容。仅改变展示，不删除、不重新分配那两条历史记录。
- 共享/索引错误提示改为简短说明，不再指向已移除的归属横幅。
- 更新既有集成断言：横幅不存在，同时仍验证诊断内容、完整恢复包及零持久化写入。指定的三份安全测试文件零改动。

改动文件：HANDOFF.md、src/ui/ConfigSets/RecoveryPanel.vue、src/stores/configStore.ts、src/stores/projectMetadata.ts、tests/project-navigation-e2e.test.ts、本报告及同名 VERIFY.log。

## 模块不可添加的真实原因

`ModuleSelector.vue` 在目录项 `status === 'unsupported'` 时禁用复选框；`readBuiltinModules` 同时拒绝加载，所以不是单纯的灰色样式。

| 发布版本 | 目录数量 | 可选 | 不可选原因 |
|---|---:|---:|---|
| 4.4.0 | 98 | 94 | Dcm、MemMap、Rte、Xcp 没有生成的定义资产，历史抽取分别被 ADD-INFO、MULTILINE、URI、LINKER 类型阻断 |
| 4.2.2 | 84 | 23 | 55 项已解析，但生成器以 B2-SYMBOLIC 资格验证待完成为由保留禁用；另 6 项未解析：Dbg、Dcm、MemMap、Rte、TcpIp、Xcp |

### Dcm：目录与当前解析器不同步，但不能据此宣布模块已完成

两版目录的 Dcm 均为 `parsed:false, asset:null, status:unsupported`，原因记录为 `DcmDspOdxDataDescription: 不支持的参数类型 ECUC-ADD-INFO-PARAM-DEF`。

当前 importer 已存在 ADD-INFO → STRING 的兼容映射。用用户提供的实际源文件向 `.temp` 临时输出重新抽取，结果：

```text
4.4.0: 容器 151 | 参数 237 | 引用 116 | 体积 452 KB
4.2.2: 容器 131 | 参数 228 | 引用 76 | 体积 388 KB
```

这说明目录仍保留旧失败状态。实际临时产物的 `DcmDspOdxDataDescription` 只是 `type: STRING`，没有保留独立 ADD-INFO 类型，也没有注释所说的只读标记。既有 `TASK-021-B2-PLAN.md` 要求保留 DocumentationBlock 结构和往返语义，不能降成普通字符串。该兼容映射并未完成这项验收，因此本轮不直接取消禁用、不伪造模块支持。

4.2.2 的 55 项限制来自 `scripts/lib/bswmd-catalog.mjs` 的明确条件：非 Dem 且含 symbolic 引用，保留 B2-SYMBOLIC 状态；不是目标芯片或用户未导入文件导致。

后续实际接入应完成相应字段类型的解析/编辑/保存/ARXML 往返/输出边界，更新双版本资产与资格报告。当前只列齐模块目录，不能对外声称全部模块可配置。此次保留 `tests/catalog.test.ts` 整文件零改动，没有通过跳过字段、关校验或修改数量断言来放行。

## 验证

此次只读调查没有改变内置目录或用户模块数据。完整原始输出见 `UI-OWNERSHIP-BANNER-VERIFY.log`。

```text
$env:PERF_GATE = '1'; npm run test:verify -- --no-file-parallelism
 Test Files  41 passed (41)
      Tests  446 passed | 4 skipped (450)
   Start at  11:29:26
   Duration  154.07s (transform 3.35s, setup 0ms, collect 73.81s, tests 34.60s, environment 32.16s, prepare 5.42s)
Test collection guard: 41/41 disk test files collected
perf: 500 实例搜索 三次 95.43 / 47.94 / 56.02ms → 中位数 56.02ms（预算 300ms）
perf: 20 步撤销（含工作区渲染） 三次 296.43 / 271.71 / 276.67ms → 中位数 276.67ms（预算 800ms）
```

退出码 0。`npx vue-tsc --noEmit` 输出为空、退出码 0；`npm run build` 通过，原文 `✓ built in 13.00s`，保留原有大 chunk 提示。四个跳过用例为既有待重写语义，未新增 skip。

桌面启动器返回 `Ready: http://localhost:3000/`。只读请求运行中服务的 RecoveryPanel 编译资源：HTTP 200，`OwnershipBannerPresent: False`，`RecoveryProtectionPresent: True`。没有操作用户工程数据或声称已做原生浏览器点击验收。
