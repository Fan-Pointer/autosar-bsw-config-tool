# TASK-021 后续类型批次建议（待 WorkBuddy 下发）

本文件是实现方提交的计划建议，不是任务契约或阶段批准。事实来自 `evidence/task021/type-coverage.json` 和双版本 `catalog.json`，2026-11-06。

## 依据与适用边界

- 官方 [CP 4.4.0 ECU Configuration](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ECUConfiguration.pdf)：§2.3.5.7/TPS_ECUC_02034 的枚举默认值须属于 literals；STANDARDIZED 定义可以缺供应商 literals。本次保留源错误默认值诊断，不发明修正值。
- 官方 [CP 4.3.1 ECU Configuration](https://www.autosar.org/fileadmin/standards/R4.3.1/CP/AUTOSAR_TPS_ECUConfiguration.pdf) 可访问全文，是下表历史类型的交叉核查资料。**未获取并逐条核对 CP 4.2.2 原版规范全文**，不得把 4.3.1 条号宣称为已核实的 4.2.2 条号；后续契约须先补齐目标版本差异确认。
- 官方 [CP 4.4.0 Model Constraints](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TR_AutosarModelConstraints.pdf) Table A.294：URI 引用按 destinationUri 定义匹配目标，不能直接当作普通路径引用。

## 候选批次与验收矩阵

| 批次 | 实际数量/模块 | 已核查条款入口 | 建议验收（实施前由评审方定稿） |
|---|---|---|---|
| B2-SYMBOLIC | 4.2.2 247 处/61 模块；本轮 Dem 4 处，余 243/60；其中 55 模块已解析但未开放 | CP4.3.1 §2.4.5.2 TPS_ECUC_03036/03037、constr_3217 | 补齐 symbolicNameValue 定义/值条件与符号语义；局部/外部、合法/悬空/错误类型、必填/可选、多目标矩阵；JSON、ARXML DEST/值往返，C 符号编译；全部 60 模块逐项扫描后放行 |
| B2-LINKER | 4.2.2 5处/Dbg、Rte、Xcp；4.4.0 4处/Rte、Xcp | CP4.3.1 §2.3.5.5 TPS_ECUC_06006、02030、02031 | 独立 LINKER 类型；合法符号、非法首字符/长度边界、默认值、XML转义、文本值往返；生成声明与可编译测试，不能伪造地址 |
| B2-ADD-INFO | 两版本各1处/Dcm | CP4.3.1 §2.3.5.9 TPS_ECUC_02118、02123 | DocumentationBlock 结构保真；空/必填、多语言/格式片段、转义、非法节点；编辑与导出不会降成普通字符串；生成按定义语义明确支持或拒绝 |
| B2-MULTILINE | 两版本各2处/MemMap | CP4.3.1 §2.3.5.4 Table2.21 | 保留换行/空白/引号/长度约束；JSON/ARXML双往返；多行编辑；C字符串转义/编译，不能折叠成单行 |
| B2-URI | 4.4.0 11处/Rte | CP4.4.0 Model Constraints TableA.294；ECUC Fig2.28 | 解析destinationUri元数据与目标匹配；缺失/多个/跨模块目标；namespace与DEST；隔离版本；未实现跨模块编辑前只读并明确输出边界 |
| B2-DEFINITION | 4.2.2 TcpIp 1个当前解析失败模块；新扫描仍可能暴露次生问题 | 以源 TcpIp 数值范围与目标发布规范核对 | MIN>MAX 不交换、不钳制、不伪造合法范围；保留诊断，明确只读或阻断策略；范围上下界/反例/输出矩阵 |
| 枚举余量 | 当前三处非法default已全部保留；FrTrcv受SYMBOLIC批次限制 | CP4.4.0 TPS_ECUC_02034；目标4.2.2条款待补核 | 再扫描确认错误数量；合法选项可编辑、错误默认值不自动确认、源诊断可追溯；Adc/Ocu硬件空枚举仍需真实供应商定义 |

建议顺序：SYMBOLIC 语义与全库资格 → LINKER/MULTILINE → ADD-INFO → URI；TcpIp 源定义异常单独小任务。
每批必须重新生成两版 catalog，运行创建/编辑/保存、成功输出与预期拒绝的双向矩阵，再更新可选状态。
不能仅因 parser 返回对象便把模块标为全部可用。

## 本轮符号引用边界

Dem 4.2.2 四处均为模块外目标，本轮保留 kind、目标、DEST，按已有外部引用只读/输出闸门处理。
合成局部用例只证明目标存在性、目标定义、版本隔离和序列化；没有证明 constr_3217 的完整符号属性或供应商生成语义。
完整符号属性传播与 C 符号资格属于 B2，不能将本轮最小支持写成全标准符合性。
