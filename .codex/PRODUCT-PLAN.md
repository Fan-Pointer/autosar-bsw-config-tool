# 产品规划与最终验收清单

> 维护方：WorkBuddy（架构师）｜ 版本 v1.0 ｜ 2026-10-31
> 依据：`SRS_AUTOSAR_DTC_ConfigTool.md`、`INSTRUCTION_AUTOSAR_DTC_ConfigTool.md`、`project-engineering-file.md`、`docs/ARCHITECTURE-v2.md` 内嵌 ADR

---

## 一、产品定位（不扩张）

**一句话**：面向汽车电子工程师的**网页版 AUTOSAR Classic BSW 配置工具**，首期只做 **DEM 模块**，覆盖「配置 → 校验 → 生成 C 配置代码 → 导出」闭环，纯前端离线运行。

**明确不是**：
- ❌ 不是全 BSW 商业配置器（不做 RTE、不做 OS 调度配置、不做 MCAL 芯片级参数）
- ❌ 不替代 DaVinci/ISOLAR 的全工程集成能力（不做系统描述导入、不做变体矩阵、不做多用户协作）
- ❌ 不做后端、不做账号、不做云端存储

**首期价值主张**：把「手写 DTC 表 + 手写 `_Cfg.h` + 人工核对约束」的三件事，收成一个可视化界面，且约束由 AUTOSAR 规范固化，不靠工程师记忆。

---

## 二、首期范围（DEM，冻结）

| 能力 | 说明 | 状态 |
|---|---|---|
| BSWMD 驱动 | 参数定义来自 `bswmd/*.json`，加模块不改核心 | ✅ TASK-002 |
| 容器实例管理 | 按 multiplicity 建实例，支持新增/删除/克隆 | 🔧 TASK-003（阻塞项修复起） |
| 参数编辑 | 按类型渲染控件，范围/枚举/必填即时校验 | ✅ TASK-002 |
| 引用关系 | 引用字段按 `destinationContainerType` 选择目标 | ✅ TASK-002 |
| 约束校验 | DEM-001/002/003/006/008 + 定义级校验 | ✅ TASK-002 |
| C 代码生成 | `Dem_Cfg.h` / `Dem_PBCfg.c`，可被 GCC `-Werror` 编译 | ✅ TASK-002 |
| 本地持久化 | IndexedDB/localStorage，刷新不丢 | ✅ TASK-002 |
| ARXML 导入导出 | AUTOSAR 4.2.2 ECU Configuration | ⬜ TASK-004 |
| 引用关系图 | Vue Flow 可视化 DTC→Attributes→Debounce | ⬜ TASK-005 |
| 撤销/重做 | ≥20 步 | ⬜ TASK-005 |
| 暗色主题 | — | ⬜ 可选 |

**首期不做**：DCM/NvM/Can 等模块、变体管理、Python 约束运行时、多用户、后端。

---

## 三、阶段路线（TASK 序列）

| 任务 | 目标 | 验收要点 | 依赖 |
|---|---|---|---|
| TASK-002 | BSWMD 引擎 + 动态 UI + 生成器 | 14 文件、35 测试、core 无 UI 依赖 | — |
| **TASK-003** | **容器实例生命周期 + 校验信息质量** | 按 multiplicity 建实例；新增/删除/克隆 API 与 UI；缺失/非法/越界三类提示可操作 | TASK-002 APPROVED |
| TASK-004 | ARXML 导出（先出后入） | 命名空间 4.2.2、UUID、`ECUC-MODULE-CONFIGURATION-VALUES` 结构；导出文件结构可被独立 XSD 子集校验 | TASK-003 |
| TASK-005 | 引用关系图 + 撤销重做 | 悬空引用红色高亮；点击节点跳转；Ctrl+Z/Y 20 步 | TASK-004 |
| TASK-006 | 产品化收口 | 运行方式、示例工程、操作说明、已知限制、独立评审 | TASK-005 |

> 顺序理由：先把「能配多条 DTC 并正确校验」这件最基础的事做扎实（TASK-003），再谈导出格式（TASK-004）。导出做早了，模型一改就要重导。

---

## 四、最终验收清单（交付给王上时逐项核）

### A. 可运行

- [ ] `npm install` 在干净环境可完成，无缺失依赖
- [ ] `npm run dev` 启动，浏览器打开即出现工作区，无控制台报错
- [ ] `npm run build` 通过
- [ ] 全程无后端、无网络请求（除加载本地 `bswmd/*.json`）

### B. 核心场景走通（演示脚本）

- [ ] 新建 DEM 配置 → 初始为 0 条 DTC（不残留预置实例）
- [ ] 连续新增 3 条 DTC：`0x123456` / `0x123457` / `0x123456` → 第三条报「DTC 值重复」并定位到字段
- [ ] 把第三条改成 `0x123458` → 错误消失
- [ ] 新增 DTC Attributes，开启 Aging 但不选 Cycle → 报 R-008
- [ ] 选一个 OperationCycle → 错误消失
- [ ] 新增 Debounce，Failed 填 -5 / Passed 填 5 → 两条符号错误
- [ ] 修正后校验全绿 → 可生成代码
- [ ] 生成 `Dem_Cfg.h` + `Dem_PBCfg.c`，用 GCC `-std=c11 -Wall -Wextra -Werror` 语法检查通过
- [ ] 刷新页面 → 配置恢复
- [ ] 存在 ERROR 时生成按钮不可用

### C. 架构约束

- [ ] `src/core/**` 无 `vue`/`pinia`/`element-plus` 引用
- [ ] `src/ui/**` 无 DEM 专有字段名
- [ ] 全仓无 `any`、无 `@ts-ignore`、无 `@ts-expect-error`
- [ ] 新增一个模块只需增加 `bswmd/<module>_bswmd.json`，不改核心代码（用 Dcm 最小样本验证一次即可）

### D. 文档与可维护

- [ ] `README.md` 含：运行方式、目录说明、核心操作三步、已知限制
- [ ] `docs/ARCHITECTURE-v2.md` 与实现一致（发现漂移必须改文档或改代码，不许两头不一致）
- [ ] `.codex/` 下有完整 TASK 记录：契约、报告、每轮评审、STATE 变更可追溯
- [ ] 每个 TASK 至少一轮独立评审记录（🔴 全部关闭才 APPROVED）

### E. 已知限制必须如实写明（不许隐藏）

- [ ] C 生成仅为配置宏与常量表，未对接任何供应商 BSW 库 ABI
- [ ] 无 ARXML 导入（导出先做）
- [ ] 单模块单配置实例，无跨模块一致性校验
- [ ] 无变体（PreCompile/LinkTime/PostBuild）区分能力
- [ ] 大数据量（>1000 DTC）未压测

---

## 五、范围歧义（需王上裁定）

| # | 歧义 | 选项 A | 选项 B | 我的建议 |
|---|---|---|---|---|
| 1 | 生成的 C 代码目标 | 仅生成配置宏/常量表（通用，不含结构体布局） | 绑定特定供应商（如普华/恒润）的 `_Cfg.h` 布局 | **A**。绑供应商会把工具变成定制项目，且无其头文件无法验证 |
| 2 | ARXML 导出范围 | 只导 `ECUC-MODULE-CONFIGURATION-VALUES`（配置值） | 连同 `ECUC-MODULE-DEF` 一起导（自包含） | **A**。定义来自 AUTOSAR 标准文件，导出值是配置器本分 |
| 3 | 是否做 ARXML 导入 | 暂不做（导出优先） | 同步做（需处理 OEM 系统描述兼容） | **A**，TASK-004 先出后入 |
| 4 | 多模块扩展节奏 | DEM 收口后再扩 DCM | 引擎完成后即并行铺 5 个模块 | **A**。单模块打磨出模板，再复用 |
| 5 | 是否需要中文界面 | 中文 | 中英双语 | 中文（当前已中文），双语进 TASK-006 可选 |
| 6 | 部署形态 | 本地 `npm run dev` / 静态文件 | 需要在线可访问链接 | 待定，若不涉及外发则本地即可 |

---

## 六、自动开发停止条件

满足全部条件后停止自动开发，交王上验收：

1. 上表 A–E 全绿
2. 至少 TASK-002 ~ TASK-006 均有 APPROVED 记录
3. 范围歧义 1–6 有明确裁定
4. 王上完成一次人工验收（按 B 节演示脚本亲自走一遍）
