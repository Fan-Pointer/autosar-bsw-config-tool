# 用户需求澄清：ARXML 定义提取与多模块工作区

来源：2026-11-06 Codex 主对话，用户原话：“另外你的模块应该是从利用脚本autosar的容器Arxml中抽取出来，所以一个模块和多个模块的应该是同时建议的，界面上不应该只能添加一个模块”。

## 已确认意图

- 模块应由 AUTOSAR ECUC 参数/容器定义 ARXML 提取，不能依靠 UI 手写字段。
- 需支持单模块与多模块，界面不能限制为只添加一个模块。
- 先前“单一配置方案”指本期不做 Pre/Link/Post-build 变体，不应理解为只能有一个 BSW 模块。
- 本条不等于已要求完整实现所有 BSW/MCAL/RTE 模块的专用业务逻辑；通用定义驱动能力与特定模块验证范围仍应分开声明。

## 本次代码核查事实

- `scripts/gen-bswmd-from-arxml.mjs` 目前每次命令提取一个指定模块，默认 Dem；输入可含多个 ECUC-MODULE-DEF，调用 importEcucModuleArxml(source, moduleName)。尚无批量选择/输出命令入口。
- `src/core/bswmd/EcucArxmlImporter.ts` 已有 listEcucModuleNames 与按名字提取单个模块能力。
- `src/ui/Modules/ModuleManager.vue` 已有 ARXML 文件内模块复选框、批量读取/导入和加入模块列表；因此“没有多模块 UI 代码”不是事实，但当前默认内置定义只有 Dem，真实单/多模块体验尚待本轮运行验证。
- `src/views/WorkspaceView.vue` 的 includedModules 来自已载入定义，openModule(name) 按 moduleRef 找配置集，没有则创建；配置集由多个 ConfigInstance 组成。
- `src/core/config/ConfigTypes.ts` 的每个 ConfigInstance 只有一个 moduleRef/version，库中可放多个配置集。目前没有显式工程实体关联各模块配置、工程级整体输出与跨模块引用闭环。

## 提交 WorkBuddy 的设计与验收输入（由评审方定契约）

1. 核对现有单/多模块定义提取能力与当前界面为何只看见一个模块；提供脚本单模块和批量模式，同一通用解析器、准确来源与版本信息。
2. 单个含多个模块的 ARXML 可选择多个模块导入，单模块文件也可导入；已有定义/版本冲突须预览并解释，不覆盖现有用户配置。
3. 同一工作区至少以 Dem + CanIf/NvM 的真实定义验证并存、模块切换、独立编辑、保存与刷新恢复，无硬编码伪列表。
4. 对工程身份、多模块整体备份/导出、跨模块引用与校验的支持边界明确设计；若现有架构不足，由 WorkBuddy 修订技术设计与阶段契约，不能把多个孤立配置集说成已完成工程级闭环。
5. 不绕 TASK-012 旧库锁和隔离保护；已有数据迁移必须可取消、可取回，未获得真实验证前不宣称供应商集成或全部模块支持。

此文为用户需求与代码现状交接，不是 Codex 自行修改架构/阶段，也不修改正在评审的 TASK-012 版本。
