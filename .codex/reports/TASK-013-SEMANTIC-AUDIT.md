# TASK-013 语义核查表

基线：`09be0e0f238fc44c7ff0498469da6d863390ce21`，独立测试 `.temp/wb-review-tests.json`。结果来自最终测试原文，不以编译代替功能测试。

## 原 70 失败逐项闭合

| # | 文件 / 原用例意图 | 修法与保留标准 | 最终结果 |
|---|---|---|---|
| 1 | arxml-editor.test.ts — explicit configuration flags in editor history and storage confirms an unchanged suggestion, changes export semantics, and undoes/redoes/persists that choice | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 2 | arxml-editor.test.ts — explicit configuration flags in editor history and storage records reference selection and clearing flags in one-step undo/redo | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 3 | arxml-editor.test.ts — explicit configuration flags in editor history and storage restores pre-flag local storage by inferring only selected targets, without changing UUIDs | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 4 | arxml-fidelity.test.ts — official module regressions Dem: the original 31-field/one-configured reproduction now rejects the other mandatory suggestions | 官方语义重算：67 定义、初始化 50 参数 + DTC 5；实际必填逐条断言，明确 false 与其余必填确认后往返 | passed |
| 5 | arxml-fidelity.test.ts — official module regressions Dem: one explicitly configured root parameter produces one VALUE and leaves all other flags false | 官方语义重算：67 定义、初始化 50 参数 + DTC 5；实际必填逐条断言，明确 false 与其余必填确认后往返 | passed |
| 6 | ecuc-ui.test.ts — D3 reference empty state names the missing target, creates and assigns it, and undoes the entire operation | 官方路径定位 DTC 与引用，创建/赋值/单步撤销断言保留 | passed |
| 7 | ecuc.test.ts — official ECUC selected-module importer retains choice alternatives and cross-module destinations with visible export limitations | 能力演进：保留候选/外部目标检查，CHOICE 可导出但未选择仍拒绝；检查真实限制文案 | passed |
| 8 | editor-ui.test.ts — TASK-006 workspace interactions supports Ctrl/Shift selection, shared parameters, skip summaries and one-step batch undo | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 9 | editor-ui.test.ts — TASK-006 workspace interactions marks imported dangling references in tree and form, navigates errors, clears and undoes them | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 10 | editor-ui.test.ts — TASK-006 workspace interactions searches across sets, highlights literal matches and focuses the selected parameter after switching | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 11 | editor-ui.test.ts — TASK-006 workspace interactions renders twenty undo steps within 500 ms and restores the full configuration | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 12 | editor.test.ts — batch edits intersects by definition UUID, never by display name | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 13 | editor.test.ts — batch edits reports 2 successes/1 disabled skip and undoes the batch as exactly one step | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 14 | editor.test.ts — global search and local theme indexes and searches 500 instances in at most 200 ms | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 15 | editor.test.ts — import hardening and diagnostics strips a complete internal declaration before parsing and decodes only builtin entities once | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 16 | editor.test.ts — import hardening and diagnostics reports actual/expected definition UUID and total occurrences for containers, parameters and references | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 17 | editor.test.ts — import hardening and diagnostics preserves literal CDATA alongside ordinary builtin and numeric entities | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 18 | editor.test.ts — import hardening and diagnostics retains imported dangling UUIDs with field, instance and readable target prefix in violations | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 19 | io-ui.test.ts — transactional store IO allows a field removed by import to be explicitly enabled again without showing a phantom default | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 20 | io-ui.test.ts — transactional store IO previews without mutation then commits one complete library and survives reload | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 21 | io-ui.test.ts — transactional store IO restores the entire JSON into an empty library including metadata and references | 测试隔离：仅清空内存 mock 后模拟空目标库；S1 未读库写保护不变 | passed |
| 22 | io-ui.test.ts — transactional store IO persists the skip strategy from the same preview | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 23 | io-ui.test.ts — transactional store IO persists the rename strategy from the same preview | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 24 | io-ui.test.ts — transactional store IO leaves the exact original config, selection, dirty flag and storage after a failed write | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 25 | io-ui.test.ts — transactional store IO rolls back a mid-plan failure injected after successful parsing without saving a partial tree | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 26 | io-ui.test.ts — transactional store IO rejects malformed input with a readable error and protects edits made after preview | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 27 | io-ui.test.ts — transactional store IO does not publish staged state while writing and prevents concurrent editor actions | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 28 | io-ui.test.ts — import preview UI and project menus renders hostile file text literally in conflicts without creating HTML elements | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 29 | io-ui.test.ts — import preview UI and project menus reads an actual file, shows exactly four conflict columns in order, and cancels without saving | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 30 | io-ui.test.ts — import preview UI and project menus applies overwrite through the visible preview controls | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 31 | io-ui.test.ts — import preview UI and project menus applies skip through the visible preview controls | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 32 | io-ui.test.ts — import preview UI and project menus applies rename through the visible preview controls | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 33 | io-ui.test.ts — import preview UI and project menus imports ARXML through the same local file preview and renders file strings as text | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 34 | io-ui.test.ts — import preview UI and project menus opens import/export submenus, downloads all three formats and distinguishes module/set tooltips | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 35 | io.test.ts — lossless JSON import/export round-trips every metadata field, UUID, definitionRef, parameter state and reference through a new set | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 36 | io.test.ts — lossless JSON import/export merges an export into a freshly initialized set with references remapped by path | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 37 | io.test.ts — lossless JSON import/export rejects incompatible module versions and duplicate identities without mutating its source | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 38 | io.test.ts — lossless JSON import/export rejects wrong value types, duplicate fields and wrong-parent definitions | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 39 | io.test.ts — lossless JSON import/export accepts a UTF-8 BOM and retains dangling UUID references for existing validation | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 40 | io.test.ts — ARXML structure and security uses r4.2.2, ECUC hierarchy, UUIDs, definition paths, and correct reference paths | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 41 | io.test.ts — ARXML structure and security escapes and restores text including entities and whitespace without markup injection | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 42 | io.test.ts — ARXML structure and security accepts namespace-prefixed ARXML and generates missing UUIDs through the common utility | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 43 | io.test.ts — ARXML structure and security rejects malformed XML, wrong namespaces, multiple modules, unresolved references and excessive nesting | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 44 | io.test.ts — conflict preview and immutable merge renames ARXML value conflicts without treating default/configured flags as value differences | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 45 | io.test.ts — conflict preview and immutable merge applies overwrite with accurate conflicts, preserved originals and remapped references | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 46 | io.test.ts — conflict preview and immutable merge applies skip with accurate conflicts, preserved originals and remapped references | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 47 | io.test.ts — conflict preview and immutable merge applies rename with accurate conflicts, preserved originals and remapped references | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 48 | io.test.ts — conflict preview and immutable merge compares reference paths instead of UUIDs and shows both file and project targets | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 49 | io.test.ts — conflict preview and immutable merge counts removed parameters/references only on overwritten instances and preserves unrelated children | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 50 | io.test.ts — conflict preview and immutable merge regenerates colliding UUIDs on new paths and prevents rename from exceeding multiplicity | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 51 | io.test.ts — definition-driven DTC CSV exports BOM, one row per DTC, six-digit uppercase hex and referenced attributes / EventIds | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 52 | io.test.ts — definition-driven DTC CSV keeps extracting values after definitions and instances are renamed, escaping spreadsheet text | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 53 | lifecycle.test.ts — core cloning and lifecycle availability deep-copies a complete set, regenerates every UUID and remaps forward/cyclic references | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 54 | lifecycle.test.ts — core cloning and lifecycle availability remaps self and descendant targets when cloning a nested subtree | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 55 | lifecycle.test.ts — core cloning and lifecycle availability uses only direct definitions and handles zero upper bounds without mutation | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 56 | lifecycle.test.ts — configuration library and editor actions starts empty and creates named sets with unique identities and selected required roots | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 57 | lifecycle.test.ts — configuration library and editor actions adds three uniquely named DTCs, selects them, falls back to parent on delete and reuses gaps safely | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 58 | lifecycle.test.ts — configuration library and editor actions does not switch or discard dirty edits when storage rejects the outgoing save | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 59 | lifecycle.test.ts — configuration library and editor actions clones a set with remapped reference choices and leaves source edits isolated | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 60 | lifecycle.test.ts — configuration library and editor actions does not clear dirty state for edits made while an older snapshot is being saved | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 61 | replica.test.ts — screenshot replica interactions adds under a selected definition and filters mixed nodes by instance path | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 62 | replica.test.ts — screenshot replica interactions keeps disabled optional fields absent through save and restore | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 63 | ui.test.ts — definition-driven components renders enum, boolean, numeric and string controls with required markers and bounds | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 64 | ui.test.ts — definition-driven components renders recursive tree nodes, multiplicities and distinct parameter/reference icons | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 65 | ui.test.ts — workspace integration and local persistence navigates from a real violation to the field and generates C after fixing the reference | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 66 | ui.test.ts — TASK-003 user interactions shows a real create action in the empty workspace and opens a named set with the DTC guide | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 67 | ui.test.ts — TASK-003 user interactions opens a child-definition chooser and disables upper-bound additions at the module root | 现有 DOM 定位：按 child-option-name 找行中的添加按钮，仍断言禁用与上限原因 | passed |
| 68 | ui.test.ts — TASK-003 user interactions uses confirmation for instance deletion and immediately selects its surviving parent | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 69 | ui.test.ts — TASK-003 user interactions colors every conflicting node and focuses its exact field when a violation is clicked | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |
| 70 | ui.test.ts — TASK-003 user interactions saves edits when returning home and opens the persisted set through the home list | 合成定义：保留断言行为，替换错误的官方 UUID 借位/旧层级输入 | passed |

## 所有改动断言的逐项对照

以下按 TypeScript AST 中 expect 调用顺序对齐，列出每个文字发生变化的断言表达式。未列出的断言文本保持不变；fixture 切换使其重新验证原有行为。合成字段 ID 是稳定测试身份，绝不映射到官方字段；`FixtureText` 为 STRING，`FixtureToggle` 为 BOOLEAN。

### tests/arxml-editor.test.ts

静态 expect 调用数：13 → 13。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 92: <code>expect( restored.selectedEntry!.container.references.get('ecuc-dem-dtc-attributes-ref') ).toMatchObject({ targetUuid: attributes.uuid, isConfigured: true })</code> | 92: <code>expect( restored.selectedEntry!.container.references.get('fixture-dem-dtc-attributes-ref') ).toMatchObject({ targetUuid: attributes.uuid, isConfigured: true })</code> |
| 95: <code>expect( restored.selectedEntry!.container.references.get('ecuc-dem-dtc-obd-ref')?.isConfigured ).toBe(false)</code> | 95: <code>expect( restored.selectedEntry!.container.references.get('fixture-dem-dtc-obd-ref')?.isConfigured ).toBe(false)</code> |
### tests/arxml-fidelity.test.ts

静态 expect 调用数：60 → 65。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 265: <code>expect( collectContainers(config, module).flatMap((e) => [...e.container.parameters.values()]) ).toHaveLength(31)</code> | 262: <code>expect(indexDefinitions(module).size).toBe(67)</code> |
| 269: <code>expect(configured).toHaveLength(1)</code> | 272: <code>expect(dtc.parameters.size).toBe(5)</code> |
| 270: <code>expect(() => exportArxml(config, module)).toThrow('DemConfigSet/DemDTC/DemDTCSeverity')</code> | 273: <code>expect( collectContainers(config, module).flatMap((e) => [...e.container.parameters.values()]) ).toHaveLength(55)</code> |
| 281: <code>expect(document.querySelectorAll('VALUE')).toHaveLength(1)</code> | 277: <code>expect(configured).toHaveLength(1)</code> |
| 282: <code>expect(document.querySelector('ECUC-NUMERICAL-PARAM-VALUE > DEFINITION-REF')?.textContent).toBe( `/AUTOSAR/EcucDefs/Dem/DemConfigSet/${field.shortName}` )</code> | 281: <code>expect(() => exportArxml(config, module)).toThrow(`${entry.path}/${p.shortName}`)</code> |
| 286: <code>expect(flags(copy, module)).toEqual(flags(config, module))</code> | 291: <code>expect(Object.values(flags(config, module)).filter(Boolean)).toHaveLength(1)</code> |
| 287: <code>expect(copy.containers).toEqual(config.containers)</code> | 298: <code>expect(() => exportArxml(config, module)).toThrow('必填项未配置')</code> |
| 288: <code>expect(copy.createdAt).toBe(config.createdAt)</code> | 312: <code>expect(document.querySelectorAll('VALUE')).toHaveLength(requiredCount)</code> |
| 289: <code>expect(copy.lastModified).toBe(config.lastModified)</code> | 314: <code>expect( raw.containers .find((c) => c.shortName === 'DemGeneral')! .parameters.find((p) => p.shortName === 'DemDevErrorDetect')!.definitionPath ).toBe(expectedPath)</code> |
| 299: <code>expect(entries.flatMap((e) => [...e.container.parameters.values()])).toHaveLength(45)</code> | 322: <code>expect(emitted?.querySelector('VALUE')?.textContent).toBe('false')</code> |
| 302: <code>expect(() => exportArxml(config, module)).toThrow(`${entry.path}/${def.shortName}`)</code> | 324: <code>expect(flags(copy, module)).toEqual(flags(config, module))</code> |
| 317: <code>expect(doc(xml).querySelectorAll('VALUE')).toHaveLength(count)</code> | 325: <code>expect(copy.containers).toEqual(config.containers)</code> |
| 318: <code>expect(flags(copy, module)).toEqual(flags(config, module))</code> | 326: <code>expect(copy.createdAt).toBe(config.createdAt)</code> |
| 319: <code>expect(copy.containers).toEqual(config.containers)</code> | 327: <code>expect(copy.lastModified).toBe(config.lastModified)</code> |
| 320: <code>expect(serializeConfig(copy).createdAt).toBe(config.createdAt)</code> | 337: <code>expect(entries.flatMap((e) => [...e.container.parameters.values()])).toHaveLength(45)</code> |
| 321: <code>expect(copy.lastModified).toBe(config.lastModified)</code> | 340: <code>expect(() => exportArxml(config, module)).toThrow(`${entry.path}/${def.shortName}`)</code> |
| 322: <code>expect( new Set([...doc(xml).querySelectorAll('[UUID]')].map((n) => n.getAttribute('UUID'))).size ).toBe(doc(xml).querySelectorAll('[UUID]').length)</code> | 355: <code>expect(doc(xml).querySelectorAll('VALUE')).toHaveLength(count)</code> |
| （新增） | 356: <code>expect(flags(copy, module)).toEqual(flags(config, module))</code> |
| （新增） | 357: <code>expect(copy.containers).toEqual(config.containers)</code> |
| （新增） | 358: <code>expect(serializeConfig(copy).createdAt).toBe(config.createdAt)</code> |
| （新增） | 359: <code>expect(copy.lastModified).toBe(config.lastModified)</code> |
| （新增） | 360: <code>expect( new Set([...doc(xml).querySelectorAll('[UUID]')].map((n) => n.getAttribute('UUID'))).size ).toBe(doc(xml).querySelectorAll('[UUID]').length)</code> |
### tests/ecuc-ui.test.ts

静态 expect 调用数：45 → 45。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 276: <code>expect(store.referenceData['ecuc-dem-dtc-attributes-ref']).not.toBe('')</code> | 277: <code>expect(store.referenceData[byPath('DemConfigSet/DemDTC/DemDTCAttributesRef')]).not.toBe('')</code> |
### tests/ecuc.test.ts

静态 expect 调用数：53 → 55。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 85: <code>expect(module.importWarnings?.some((item) => item.includes('CHOICE'))).toBe(true)</code> | 87: <code>expect(choice.choice?.candidateRefs).toEqual(choice.subContainers.map((item) => item.uuid))</code> |
| 86: <code>expect(module.importWarnings?.some((item) => item.includes('其他模块'))).toBe(true)</code> | 88: <code>expect(module.arxmlExportBlockers).toEqual([])</code> |
| 87: <code>expect(() => exportArxml(new ConfigInstanceManager().createFromBswmd(module), module)).toThrow( 'CHOICE' )</code> | 89: <code>expect( module.importWarnings?.some((item) => item.includes('CHOICE 分组需选择一个候选后导出')) ).toBe(true)</code> |
| 103: <code>expect(listEcucModuleNames(combined)).toEqual(['NvM', 'CanIf'])</code> | 92: <code>expect(module.importWarnings?.some((item) => /位于本模块之外\|跨模块/.test(item))).toBe(true)</code> |
| 104: <code>expect(parse).not.toHaveBeenCalled()</code> | 93: <code>expect(() => exportArxml(new ConfigInstanceManager().createFromBswmd(module), module)).toThrow( 'CHOICE' )</code> |
| 106: <code>expect(parse).toHaveBeenCalledTimes(1)</code> | 109: <code>expect(listEcucModuleNames(combined)).toEqual(['NvM', 'CanIf'])</code> |
| 107: <code>expect(String(parse.mock.calls[0][0])).not.toContain('&lt;SHORT-NAME>CanIf&lt;/SHORT-NAME>')</code> | 110: <code>expect(parse).not.toHaveBeenCalled()</code> |
| 108: <code>expect(String(parse.mock.calls[0][0]).length).toBeLessThan(combined.length / 2)</code> | 112: <code>expect(parse).toHaveBeenCalledTimes(1)</code> |
| 115: <code>expect(importEcucModuleArxml(source, 'Sample')).toEqual( importEcucModuleArxml(source, 'Sample') )</code> | 113: <code>expect(String(parse.mock.calls[0][0])).not.toContain('&lt;SHORT-NAME>CanIf&lt;/SHORT-NAME>')</code> |
| 127: <code>expect(listEcucModuleNames(commented)).toEqual(['Sample'])</code> | 114: <code>expect(String(parse.mock.calls[0][0]).length).toBeLessThan(combined.length / 2)</code> |
| 131: <code>expect(xml.querySelector('parsererror')).toBeNull()</code> | 121: <code>expect(importEcucModuleArxml(source, 'Sample')).toEqual( importEcucModuleArxml(source, 'Sample') )</code> |
| 132: <code>expect( Array.from(xml.getElementsByTagNameNS('*', 'AR-PACKAGE')).map( (pkg) => pkg.firstElementChild?.textContent ) ).toEqual(['AUTOSAR', 'EcucDefs'])</code> | 133: <code>expect(listEcucModuleNames(commented)).toEqual(['Sample'])</code> |
| 137: <code>expect(importEcucModuleArxml(extracted, 'Sample').containers).toHaveLength(1)</code> | 137: <code>expect(xml.querySelector('parsererror')).toBeNull()</code> |
| 140: <code>expect(() => importEcucModuleArxml(nvm, 'Missing')).toThrow('未找到')</code> | 138: <code>expect( Array.from(xml.getElementsByTagNameNS('*', 'AR-PACKAGE')).map( (pkg) => pkg.firstElementChild?.textContent ) ).toEqual(['AUTOSAR', 'EcucDefs'])</code> |
| 142: <code>expect(() => listEcucModuleNames( source.replace( '&lt;/ELEMENTS>', '&lt;ECUC-MODULE-DEF>&lt;SHORT-NAME>Sample&lt;/SHORT-NAME>&lt;/ECUC-MODULE-DEF>&lt;/ELEMENTS>' ) ) ).toThrow('重复')</code> | 143: <code>expect(importEcucModuleArxml(extracted, 'Sample').containers).toHaveLength(1)</code> |
| 150: <code>expect(() => listEcucModuleNames(source.replace('&lt;/CONTAINERS>', '&lt;/WRONG>'))).toThrow( '不匹配' )</code> | 146: <code>expect(() => importEcucModuleArxml(nvm, 'Missing')).toThrow('未找到')</code> |
| 159: <code>expect(() => importEcucModuleArxml(nvm.replace('&lt;AUTOSAR ', `${declaration}&lt;AUTOSAR `), 'NvM') ).toThrow(/禁止/)</code> | 148: <code>expect(() => listEcucModuleNames( source.replace( '&lt;/ELEMENTS>', '&lt;ECUC-MODULE-DEF>&lt;SHORT-NAME>Sample&lt;/SHORT-NAME>&lt;/ECUC-MODULE-DEF>&lt;/ELEMENTS>' ) ) ).toThrow('重复')</code> |
| 176: <code>expect(importArxml(xml, [module]).containers[0].uuid).toBe(instance.containers[0].uuid)</code> | 156: <code>expect(() => listEcucModuleNames(source.replace('&lt;/CONTAINERS>', '&lt;/WRONG>'))).toThrow( '不匹配' )</code> |
| 177: <code>expect(() => importArxml(xml.replace('&lt;AR-PACKAGES>', '&lt;!DOCTYPE AUTOSAR>&lt;AR-PACKAGES>'), [module]) ).toThrow('DOCTYPE')</code> | 165: <code>expect(() => importEcucModuleArxml(nvm.replace('&lt;AUTOSAR ', `${declaration}&lt;AUTOSAR `), 'NvM') ).toThrow(/禁止/)</code> |
| 182: <code>expect( importedParameter( 'ECUC-INTEGER-PARAM-DEF', '&lt;MIN>0x10&lt;/MIN>&lt;MAX>255&lt;/MAX>&lt;DEFAULT-VALUE>32&lt;/DEFAULT-VALUE>' ) ).toMatchObject({ type: 'INTEGER', min: 16, max: 255, defaultValue: 32, isOptional: false })</code> | 182: <code>expect(importArxml(xml, [module]).containers[0].uuid).toBe(instance.containers[0].uuid)</code> |
| 190: <code>expect( importedParameter( 'ECUC-FLOAT-PARAM-DEF', '&lt;MIN>-1.5&lt;/MIN>&lt;MAX>1e3&lt;/MAX>&lt;DEFAULT-VALUE>0.5&lt;/DEFAULT-VALUE>&lt;LOWER-MULTIPLICITY>0&lt;/LOWER-MULTIPLICITY>&lt;UPPER-MULTIPLICITY-INFINITE>true&lt;/UPPER-MULTIPLICITY-INFINITE>' ) ).toMatchObject({ type: 'FLOAT', min: -1.5, max: 1000, defaultValue: 0.5, isOptional: true, multiplicity: { lower: 0, upper: 'unbounded' }, })</code> | 183: <code>expect(() => importArxml(xml.replace('&lt;AR-PACKAGES>', '&lt;!DOCTYPE AUTOSAR>&lt;AR-PACKAGES>'), [module]) ).toThrow('DOCTYPE')</code> |
| 209: <code>expect(value.min).toBeUndefined()</code> | 188: <code>expect( importedParameter( 'ECUC-INTEGER-PARAM-DEF', '&lt;MIN>0x10&lt;/MIN>&lt;MAX>255&lt;/MAX>&lt;DEFAULT-VALUE>32&lt;/DEFAULT-VALUE>' ) ).toMatchObject({ type: 'INTEGER', min: 16, max: 255, defaultValue: 32, isOptional: false })</code> |
| 210: <code>expect(value.max).toBeUndefined()</code> | 196: <code>expect( importedParameter( 'ECUC-FLOAT-PARAM-DEF', '&lt;MIN>-1.5&lt;/MIN>&lt;MAX>1e3&lt;/MAX>&lt;DEFAULT-VALUE>0.5&lt;/DEFAULT-VALUE>&lt;LOWER-MULTIPLICITY>0&lt;/LOWER-MULTIPLICITY>&lt;UPPER-MULTIPLICITY-INFINITE>true&lt;/UPPER-MULTIPLICITY-INFINITE>' ) ).toMatchObject({ type: 'FLOAT', min: -1.5, max: 1000, defaultValue: 0.5, isOptional: true, multiplicity: { lower: 0, upper: 'unbounded' }, })</code> |
| 211: <code>expect(JSON.parse(JSON.stringify(value))).not.toHaveProperty('max')</code> | 215: <code>expect(value.min).toBeUndefined()</code> |
| 219: <code>expect( importedParameter('ECUC-BOOLEAN-PARAM-DEF', `&lt;DEFAULT-VALUE>${value}&lt;/DEFAULT-VALUE>`) .defaultValue ).toBe(expected)</code> | 216: <code>expect(value.max).toBeUndefined()</code> |
| 225: <code>expect( importedParameter( 'ECUC-ENUMERATION-PARAM-DEF', '&lt;DEFAULT-VALUE>A&lt;/DEFAULT-VALUE>&lt;LITERALS>&lt;ECUC-ENUMERATION-LITERAL-DEF>&lt;SHORT-NAME>A&lt;/SHORT-NAME>&lt;/ECUC-ENUMERATION-LITERAL-DEF>&lt;ECUC-ENUMERATION-LITERAL-DEF>&lt;SHORT-NAME>B&lt;/SHORT-NAME>&lt;/ECUC-ENUMERATION-LITERAL-DEF>&lt;/LITERALS>' ) ).toMatchObject({ type: 'ENUM', enumValues: ['A', 'B'], defaultValue: 'A' })</code> | 217: <code>expect(JSON.parse(JSON.stringify(value))).not.toHaveProperty('max')</code> |
| 239: <code>expect(field).toMatchObject({ minLength: 2, maxLength: 12, regularExpression: '[A-Z]+', defaultValue: 'OK', type: tag.includes('FUNCTION') ? 'FUNCTION' : 'STRING', })</code> | 225: <code>expect( importedParameter('ECUC-BOOLEAN-PARAM-DEF', `&lt;DEFAULT-VALUE>${value}&lt;/DEFAULT-VALUE>`) .defaultValue ).toBe(expected)</code> |
| 261: <code>expect(module.containers[0].references[0]).toMatchObject({ isOptional: true, destinationContainerType: 'Root', multiplicity: { lower: 0, upper: 2 }, })</code> | 231: <code>expect( importedParameter( 'ECUC-ENUMERATION-PARAM-DEF', '&lt;DEFAULT-VALUE>A&lt;/DEFAULT-VALUE>&lt;LITERALS>&lt;ECUC-ENUMERATION-LITERAL-DEF>&lt;SHORT-NAME>A&lt;/SHORT-NAME>&lt;/ECUC-ENUMERATION-LITERAL-DEF>&lt;ECUC-ENUMERATION-LITERAL-DEF>&lt;SHORT-NAME>B&lt;/SHORT-NAME>&lt;/ECUC-ENUMERATION-LITERAL-DEF>&lt;/LITERALS>' ) ).toMatchObject({ type: 'ENUM', enumValues: ['A', 'B'], defaultValue: 'A' })</code> |
| 274: <code>expect(() => importedParameter(tag, body)).toThrow()</code> | 245: <code>expect(field).toMatchObject({ minLength: 2, maxLength: 12, regularExpression: '[A-Z]+', defaultValue: 'OK', type: tag.includes('FUNCTION') ? 'FUNCTION' : 'STRING', })</code> |
| 291: <code>expect( engine .validate(config, module) .some((item) => item.definitionRef === field.uuid && item.message.includes('required')) ).toBe(true)</code> | 267: <code>expect(module.containers[0].references[0]).toMatchObject({ isOptional: true, destinationContainerType: 'Root', multiplicity: { lower: 0, upper: 2 }, })</code> |
| 297: <code>expect( engine .validate(config, module) .some((item) => item.definitionRef === field.uuid && item.message.includes('out of range')) ).toBe(true)</code> | 280: <code>expect(() => importedParameter(tag, body)).toThrow()</code> |
| 306: <code>expect(config.containers.length).toBe( module.containers.reduce((sum, item) => sum + item.multiplicity.lower, 0) )</code> | 297: <code>expect( engine .validate(config, module) .some((item) => item.definitionRef === field.uuid && item.message.includes('required')) ).toBe(true)</code> |
| 310: <code>expect(entry.container.definitionRef).toBe(entry.definition.uuid)</code> | 303: <code>expect( engine .validate(config, module) .some((item) => item.definitionRef === field.uuid && item.message.includes('out of range')) ).toBe(true)</code> |
| 312: <code>expect(config.containers.some((item) => item.definitionRef === definition.uuid)).toBe(false)</code> | 312: <code>expect(config.containers.length).toBe( module.containers.reduce((sum, item) => sum + item.multiplicity.lower, 0) )</code> |
| 315: <code>expect( statSync('tests/fixtures/ecuc-nvm.arxml').size + statSync('tests/fixtures/ecuc-canif.arxml').size ).toBeLessThan(1_200_000)</code> | 316: <code>expect(entry.container.definitionRef).toBe(entry.definition.uuid)</code> |
| 320: <code>expect( new DOMParser().parseFromString(source, 'application/xml').querySelector('parsererror') ).toBeNull()</code> | 318: <code>expect(config.containers.some((item) => item.definitionRef === definition.uuid)).toBe(false)</code> |
| 337: <code>expect(xml).toContain('DEST="ECUC-FUNCTION-NAME-DEF"')</code> | 321: <code>expect( statSync('tests/fixtures/ecuc-nvm.arxml').size + statSync('tests/fixtures/ecuc-canif.arxml').size ).toBeLessThan(1_200_000)</code> |
| 338: <code>expect(JSON.stringify(serializeConfig(importArxml(xml, [module])).containers)).toBe( JSON.stringify(serializeConfig(config).containers) )</code> | 326: <code>expect( new DOMParser().parseFromString(source, 'application/xml').querySelector('parsererror') ).toBeNull()</code> |
| （新增） | 343: <code>expect(xml).toContain('DEST="ECUC-FUNCTION-NAME-DEF"')</code> |
| （新增） | 344: <code>expect(JSON.stringify(serializeConfig(importArxml(xml, [module])).containers)).toBe( JSON.stringify(serializeConfig(config).containers) )</code> |
### tests/editor-ui.test.ts

静态 expect 调用数：48 → 48。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 108: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(1)</code> | 107: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe(1)</code> |
| 111: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(42)</code> | 110: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe(42)</code> |
| 113: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(1)</code> | 112: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe(1)</code> |
| 115: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(42)</code> | 114: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe(42)</code> |
| 171: <code>expect(store.referenceData[legacy('ecuc-dem-dtc-attributes-ref')]).toBe('')</code> | 170: <code>expect(store.referenceData['fixture-dem-dtc-attributes-ref']).toBe('')</code> |
| 209: <code>expect(wrapper.get(`[data-field="${legacy('ecuc-dem-dtc-value')}"]`).classes()).toContain('selected-field')</code> | 208: <code>expect(wrapper.get(`[data-field="${'fixture-dem-dtc-value'}"]`).classes()).toContain( 'selected-field' )</code> |
| 210: <code>expect(document.activeElement?.id).toBe('input-ecuc-dem-dtc-value')</code> | 211: <code>expect(document.activeElement?.id).toBe('input-fixture-dem-dtc-value')</code> |
| 258: <code>expect(store.referenceData[legacy('ecuc-dem-dtc-attributes-ref')]).toBe(target.uuid)</code> | 259: <code>expect(store.referenceData['fixture-dem-dtc-attributes-ref']).toBe(target.uuid)</code> |
### tests/editor.test.ts

静态 expect 调用数：74 → 74。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 118: <code>expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(true)</code> | 117: <code>expect(store.violations.some((v) => v.definitionRef === 'fixture-dem-dtc-value')).toBe(true)</code> |
| 120: <code>expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(false)</code> | 119: <code>expect(store.violations.some((v) => v.definitionRef === 'fixture-dem-dtc-value')).toBe(false)</code> |
| 122: <code>expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(true)</code> | 121: <code>expect(store.violations.some((v) => v.definitionRef === 'fixture-dem-dtc-value')).toBe(true)</code> |
| 126: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe('unfinished')</code> | 125: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe('unfinished')</code> |
| 138: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(1)</code> | 137: <code>expect(store.parameterData['fixture-dem-dtc-value']).toBe(1)</code> |
| 168: <code>expect(commonParameters(entries).map((p) => p.uuid)).toContain(legacy('ecuc-dem-dtc-value'))</code> | 167: <code>expect(commonParameters(entries).map((p) => p.uuid)).toContain('fixture-dem-dtc-value')</code> |
| 176: <code>expect(commonParameters([entries[0], other]).map((p) => p.uuid)).not.toContain( legacy('ecuc-dem-dtc-value') )</code> | 175: <code>expect(commonParameters([entries[0], other]).map((p) => p.uuid)).not.toContain( 'fixture-dem-dtc-value' )</code> |
| 193: <code>expect(store.undoLabel).toBe('批量修改 DemJ1939DTC_J1939NodeRef')</code> | 192: <code>expect(store.undoLabel).toBe('批量修改 FixtureText')</code> |
| 208: <code>expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), 25).success).toBe(3)</code> | 207: <code>expect(store.batchSetParameter('fixture-dem-dtc-value', 25).success).toBe(3)</code> |
| 212: <code>expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), '25').skipped).toHaveLength(3)</code> | 211: <code>expect(store.batchSetParameter('fixture-dem-dtc-value', '25').skipped).toHaveLength(3)</code> |
| 213: <code>expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), -1).skipped[0]).toContain('超出范围')</code> | 212: <code>expect(store.batchSetParameter('fixture-dem-dtc-value', -1).skipped[0]).toContain('超出范围')</code> |
| 230: <code>expect(searchConfigurations(index, '123456')[0].fieldUuid).toBe(legacy('ecuc-dem-dtc-value'))</code> | 229: <code>expect(searchConfigurations(index, '123456')[0].fieldUuid).toBe('fixture-dem-dtc-value')</code> |
| 345: <code>expect(() => hydrateConfig(raw, store.modules)).toThrow( /实际值 unknown.*期望值 ecuc-.*出现次数 2/ )</code> | 344: <code>expect(() => hydrateConfig(raw, store.modules)).toThrow( /实际值 unknown.*期望值 fixture-.*出现次数 2/ )</code> |
| 359: <code>expect( restored.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-j1939-node-ref'))?.value ).toBe('literal &amp; &lt;text> & A')</code> | 358: <code>expect( restored.containers[0].subContainers[0].parameters.get('fixture-text-payload')?.value ).toBe('literal &amp; &lt;text> & A')</code> |
| 372: <code>expect(store.danglingReferences).toContain(legacy('ecuc-dem-dtc-attributes-ref'))</code> | 371: <code>expect(store.danglingReferences).toContain('fixture-dem-dtc-attributes-ref')</code> |
| 373: <code>expect(store.violations.find((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toMatchObject({ severity: 'ERROR', containerUuid: ids[0], definitionRef: legacy('ecuc-dem-dtc-attributes-ref'), message: 'DemDTCAttributesRef：目标不存在（deadbeef）', })</code> | 372: <code>expect(store.violations.find((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toMatchObject({ severity: 'ERROR', containerUuid: ids[0], definitionRef: 'fixture-dem-dtc-attributes-ref', message: 'DemDTCAttributesRef：目标不存在（deadbeef）', })</code> |
### tests/io-ui.test.ts

静态 expect 调用数：64 → 64。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 59: <code>expect(store.parameterData).toHaveProperty(legacy('ecuc-dem-dtc-functional-unit'), undefined)</code> | 58: <code>expect(store.parameterData).toHaveProperty('fixture-dem-dtc-functional-unit', undefined)</code> |
| 62: <code>expect(store.parameterData[legacy('ecuc-dem-dtc-functional-unit')]).toBe(12)</code> | 61: <code>expect(store.parameterData['fixture-dem-dtc-functional-unit']).toBe(12)</code> |
| 63: <code>expect(store.referenceData[legacy('ecuc-dem-dtc-obd-ref')]).toBe('')</code> | 62: <code>expect(store.referenceData['fixture-dem-dtc-obd-ref']).toBe('')</code> |
| 76: <code>expect( store.config!.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-value'))?.value ).toBe(42)</code> | 75: <code>expect( store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value ).toBe(42)</code> |
| 148: <code>expect(store.selectedEntry!.container.parameters.get(legacy('ecuc-dem-dtc-value'))?.value).toBe(3)</code> | 151: <code>expect(store.selectedEntry!.container.parameters.get('fixture-dem-dtc-value')?.value).toBe(3)</code> |
| 166: <code>expect(() => store.setParameterValue(legacy('ecuc-dem-dtc-value'), 5)).toThrow('正在应用导入')</code> | 169: <code>expect(() => store.setParameterValue('fixture-dem-dtc-value', 5)).toThrow('正在应用导入')</code> |
| 239: <code>expect( store.config!.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-value'))?.value ).toBe(strategy === 'overwrite' ? 42 : 1)</code> | 242: <code>expect( store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value ).toBe(strategy === 'overwrite' ? 42 : 1)</code> |
| 252: <code>expect( store.config!.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-value'))?.value ).toBe(88)</code> | 255: <code>expect( store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value ).toBe(88)</code> |
### tests/io.test.ts

静态 expect 调用数：85 → 85。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 207: <code>expect( restored.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-j1939-node-ref'))?.value ).toBe(value)</code> | 206: <code>expect( restored.containers[0].subContainers[0].parameters.get('fixture-text-payload')?.value ).toBe(value)</code> |
| 310: <code>expect(original.parameters.get(legacy('ecuc-dem-dtc-value'))?.value).toBe( strategy === 'overwrite' ? 42 : 0x1a2b3c )</code> | 309: <code>expect(original.parameters.get('fixture-dem-dtc-value')?.value).toBe( strategy === 'overwrite' ? 42 : 0x1a2b3c )</code> |
| 319: <code>expect(renamed.parameters.get(legacy('ecuc-dem-dtc-value'))?.value).toBe(42)</code> | 318: <code>expect(renamed.parameters.get('fixture-dem-dtc-value')?.value).toBe(42)</code> |
| 320: <code>expect(renamed.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe( config.containers[0].subContainers[1].uuid )</code> | 319: <code>expect(renamed.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe( config.containers[0].subContainers[1].uuid )</code> |
| 323: <code>expect( plan.result.containers[0].subContainers[2].references.get(legacy('ecuc-dem-event-dtc-ref')) ?.targetUuid ).toBe(renamed.uuid)</code> | 322: <code>expect( plan.result.containers[0].subContainers[2].references.get('fixture-dem-event-dtc-ref') ?.targetUuid ).toBe(renamed.uuid)</code> |
### tests/lifecycle.test.ts

静态 expect 调用数：68 → 68。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 55: <code>expect(newDtc.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe( newAttributes.uuid )</code> | 58: <code>expect(newDtc.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe( newAttributes.uuid )</code> |
| 61: <code>expect(dtc.parameters.get(legacy('ecuc-dem-dtc-value'))?.value).toBe(1)</code> | 64: <code>expect(dtc.parameters.get('fixture-dem-dtc-value')?.value).toBe(1)</code> |
| 62: <code>expect(dtc.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe(attributes.uuid)</code> | 65: <code>expect(dtc.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe(attributes.uuid)</code> |
| 72: <code>expect(clone.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe('')</code> | 75: <code>expect(clone.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe('')</code> |
| 73: <code>expect(dtc.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe(attributes.uuid)</code> | 76: <code>expect(dtc.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe(attributes.uuid)</code> |
| 75: <code>expect(dtc.parameters.get(legacy('ecuc-dem-dtc-value'))?.value).toBe(1)</code> | 78: <code>expect(dtc.parameters.get('fixture-dem-dtc-value')?.value).toBe(1)</code> |
| 91: <code>expect(clone.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe( clone.subContainers[0].uuid )</code> | 94: <code>expect(clone.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe( clone.subContainers[0].uuid )</code> |
| 194: <code>expect(restored.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(42)</code> | 197: <code>expect(restored.parameterData['fixture-dem-dtc-value']).toBe(42)</code> |
| 195: <code>expect(restored.referenceData[legacy('ecuc-dem-dtc-attributes-ref')]).toBe(attributes.uuid)</code> | 198: <code>expect(restored.referenceData['fixture-dem-dtc-attributes-ref']).toBe(attributes.uuid)</code> |
| 198: <code>expect(restored.addContainerInstance(legacy('ecuc-dem-dtc-def'))?.shortName).toBe('DemDTC_2')</code> | 201: <code>expect(restored.addContainerInstance('fixture-dem-dtc-def')?.shortName).toBe('DemDTC_2')</code> |
| 212: <code>expect(store.parameterData[legacy('ecuc-dem-general-max-number-event')]).toBe(44)</code> | 215: <code>expect(store.parameterData['fixture-dem-general-max-number-event']).toBe(44)</code> |
| 229: <code>expect(copyDtc.references.get(legacy('ecuc-dem-dtc-attributes-ref'))?.targetUuid).toBe( copyAttributes.uuid )</code> | 232: <code>expect(copyDtc.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe( copyAttributes.uuid )</code> |
| 236: <code>expect(store.referenceData[legacy('ecuc-dem-dtc-attributes-ref')]).toBe(attributes.uuid)</code> | 239: <code>expect(store.referenceData['fixture-dem-dtc-attributes-ref']).toBe(attributes.uuid)</code> |
| 300: <code>expect(store.parameterData[legacy('ecuc-dem-general-max-number-event')]).toBe(99)</code> | 303: <code>expect(store.parameterData['fixture-dem-general-max-number-event']).toBe(99)</code> |
### tests/replica.test.ts

静态 expect 调用数：27 → 27。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
### tests/ui.test.ts

静态 expect 调用数：75 → 76。数量仅作审查辅助，业务语义见前表与代码差异。

| 原表达式（行） | 新表达式（行） |
|---|---|
| 80: <code>expect(wrapper.get(`[data-field="${legacy('ecuc-dem-attr-aging-allowed')}"]`).classes()).toContain( 'is-required' )</code> | 79: <code>expect(wrapper.get(`[data-field="${'fixture-dem-attr-aging-allowed'}"]`).classes()).toContain( 'is-required' )</code> |
| 98: <code>expect(wrapper.emitted('parameter-change')?.[0]).toEqual([ legacy('ecuc-dem-debounce-time-failed'), 1.25, ])</code> | 97: <code>expect(wrapper.emitted('parameter-change')?.[0]).toEqual([ 'fixture-dem-debounce-time-failed', 1.25, ])</code> |
| 102: <code>expect(data[legacy('ecuc-dem-debounce-time-failed')]).toBe(0.75)</code> | 101: <code>expect(data['fixture-dem-debounce-time-failed']).toBe(0.75)</code> |
| 128: <code>expect(wrapper.emitted('node-click')?.[0]?.[0]).toMatchObject({ type: 'parameter', containerUuid: config.containers[0].subContainers[1].uuid, definitionRef: legacy('ecuc-dem-attr-aging-allowed'), })</code> | 127: <code>expect(wrapper.emitted('node-click')?.[0]?.[0]).toMatchObject({ type: 'parameter', containerUuid: config.containers[0].subContainers[1].uuid, definitionRef: 'fixture-dem-attr-aging-allowed', })</code> |
| 177: <code>expect(store.parameterData[legacy('ecuc-dem-attr-aging-allowed')]).toBe(true)</code> | 176: <code>expect(store.parameterData['fixture-dem-attr-aging-allowed']).toBe(true)</code> |
| 178: <code>expect(store.referenceData[legacy('ecuc-dem-attr-aging-cycleref')]).toBe(cycle.uuid)</code> | 177: <code>expect(store.referenceData['fixture-dem-attr-aging-cycleref']).toBe(cycle.uuid)</code> |
| 215: <code>expect(store.selectedKey).toContain(legacy('ecuc-dem-dtc-attributes-ref'))</code> | 214: <code>expect(store.selectedKey).toContain('fixture-dem-dtc-attributes-ref')</code> |
| 318: <code>expect(addRoot.disabled).toBe(true)</code> | 317: <code>expect(rootRow).toBeDefined()</code> |
| 319: <code>expect(dialog.textContent).toContain('upper multiplicity 1 reached')</code> | 319: <code>expect(addRoot.disabled).toBe(true)</code> |
| 337: <code>expect(confirm).toHaveBeenCalledOnce()</code> | 320: <code>expect(dialog.textContent).toContain('upper multiplicity 1 reached')</code> |
| 338: <code>expect(store.entries).toHaveLength(2)</code> | 338: <code>expect(confirm).toHaveBeenCalledOnce()</code> |
| 342: <code>expect(store.entries).toHaveLength(1)</code> | 339: <code>expect(store.entries).toHaveLength(2)</code> |
| 343: <code>expect(store.selectedEntry?.container.uuid).toBe(rootUuid)</code> | 343: <code>expect(store.entries).toHaveLength(1)</code> |
| 360: <code>expect(store.configSets).toHaveLength(2)</code> | 344: <code>expect(store.selectedEntry?.container.uuid).toBe(rootUuid)</code> |
| 364: <code>expect(store.activeUuid).toBe(first)</code> | 361: <code>expect(store.configSets).toHaveLength(2)</code> |
| 365: <code>expect(store.configSets).toHaveLength(1)</code> | 365: <code>expect(store.activeUuid).toBe(first)</code> |
| 377: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error')</code> | 366: <code>expect(store.configSets).toHaveLength(1)</code> |
| 382: <code>expect(duplicate).toBeDefined()</code> | 378: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error')</code> |
| 385: <code>expect(store.selectedKey).toBe(`${first.uuid}:ecuc-dem-dtc-value`)</code> | 383: <code>expect(duplicate).toBeDefined()</code> |
| 386: <code>expect(document.activeElement?.closest('[data-field]')?.getAttribute('data-field')).toBe( legacy('ecuc-dem-dtc-value') )</code> | 386: <code>expect(store.selectedKey).toBe(`${first.uuid}:fixture-dem-dtc-value`)</code> |
| 389: <code>expect(Element.prototype.scrollIntoView).toHaveBeenCalled()</code> | 387: <code>expect(document.activeElement?.closest('[data-field]')?.getAttribute('data-field')).toBe( 'fixture-dem-dtc-value' )</code> |
| 399: <code>expect(wrapper.find('.floating-menu').exists()).toBe(true)</code> | 390: <code>expect(Element.prototype.scrollIntoView).toHaveBeenCalled()</code> |
| 400: <code>expect(wrapper.get('.floating-menu').text()).toContain('定位错误')</code> | 400: <code>expect(wrapper.find('.floating-menu').exists()).toBe(true)</code> |
| 405: <code>expect(remove.attributes('disabled')).toBeDefined()</code> | 401: <code>expect(wrapper.get('.floating-menu').text()).toContain('定位错误')</code> |
| 406: <code>expect(store.selectedEntry?.container.shortName).toBe('DemConfigSet')</code> | 406: <code>expect(remove.attributes('disabled')).toBeDefined()</code> |
| 408: <code>expect(wrapper.find('.floating-menu').exists()).toBe(false)</code> | 407: <code>expect(store.selectedEntry?.container.shortName).toBe('DemConfigSet')</code> |
| 417: <code>expect(wrapper.findComponent(HomeView).exists()).toBe(true)</code> | 409: <code>expect(wrapper.find('.floating-menu').exists()).toBe(false)</code> |
| 418: <code>expect(store.isDirty).toBe(false)</code> | 418: <code>expect(wrapper.findComponent(HomeView).exists()).toBe(true)</code> |
| 419: <code>expect(wrapper.text()).toContain('首页恢复测试')</code> | 419: <code>expect(store.isDirty).toBe(false)</code> |
| 425: <code>expect(router.currentRoute.value.path).toBe('/workspace')</code> | 420: <code>expect(wrapper.text()).toContain('首页恢复测试')</code> |
| 426: <code>expect(store.parameterData[legacy('ecuc-dem-general-max-number-event')]).toBe(77)</code> | 426: <code>expect(router.currentRoute.value.path).toBe('/workspace')</code> |
| 444: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-warning')</code> | 427: <code>expect(store.parameterData['fixture-dem-general-max-number-event']).toBe(77)</code> |
| 446: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error')</code> | 445: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-warning')</code> |
| 448: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-configured')</code> | 447: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error')</code> |
| （新增） | 449: <code>expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-configured')</code> |

## 非一一文本替换的语义说明

- `arxml-fidelity` 两个官方 Dem 用例按 CP4.4.0 重建：旧 31 字段样本不再当作官方模型；首例仍只有一个字段确认，检查全部实际必填路径（Severity 在官方定义是可选，不能硬判必填）。次例先确认 false 并断言恰一个配置标记，确认其余必填后核对 VALUE 数量、官方 definition path、false、全部 flags、整个树与时间戳往返。
- `ecuc` 保留 CHOICE 两候选、目标路径与空 CHOICE 拒绝；新增 candidateRefs / 空导出阻断列表检查。旧“CHOICE 未实现”预期已过时，现核查“需选候选”提示及真实跨模块限制。
- `ui` 根节点禁用用例仅定位改为实际列表行中的添加按钮，上限拒绝与解释断言不变。浮点样本以合成定义的真实名称 BasedClass 定位，边界 0.001…3600 不变。
- `io-ui` 空库恢复用例清空的仅是测试内存 Map，真实产品与用户存储不受影响；全库相等与刷新相等断言保留。
- 通用性能基线仍是固定合成规模的 20 步撤销 <500 ms、500 实例搜索 ≤200 ms，不放宽阈值。不能将其当作官方大工程实机性能，后者仍属 S7。
- `definitionIndex.legacy()` 删除加载入口，旧 legacy-map.json 保留作历史证据；所有活动测试无 legacy() 借位。准确历史恢复用例仍用原资产与 J1939/ImmediateNv 原值，未改动 15 个恢复测试。
