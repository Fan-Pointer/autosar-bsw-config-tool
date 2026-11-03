# 标准依据和可追溯证据

2026-11-03。用户确定的发布基线：AUTOSAR Classic Platform **4.4.0**。XML 命名空间为 `http://autosar.org/schema/r4.0`，不是产品发布版本号。

| 主题 | 一手依据/适用版本 | 可支持的结论与边界 |
|---|---|---|
| 源定义 | 用户文件 `../AUTOSAR_MOD_ECUConfigurationParameters.arxml` 文件头：CP4.4.0、AUTOSAR_00046.xsd；库内 `$source`记录hash | 当前官方Dem来源为4.4.0；不据此声称全部SWS规则已实现 |
| XML namespace | [CP4.4.0 ARXML Serialization Rules](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ARXMLSerializationRules.pdf)，TPS_ASR_00011；补充核对[R19-11同规范](https://www.autosar.org/fileadmin/standards/R19-11/CP/AUTOSAR_TPS_ARXMLSerializationRules.pdf) §2 Example2.4/2.5、TPS_ASR_00017 | 兼容发布沿用r4.0；默认命名空间规则。官方搜索索引取得4.4.0条款，R19-11完整文本可见；R19-11 PDF整文件曾超时，标明版本不混引 |
| CHOICE值侧 | [CP4.4.0 ECUConfiguration](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ECUConfiguration.pdf)，印刷122页，TPS_ECUC_03020、Example2.33 | CHOICE定义在值侧按普通容器处理，由子容器定义引用表达所选项；不能因ECUC-CONTAINER-VALUE与CHOICE定义DEST不同就判不合法 |
| Schema生成 | [CP4.4.0 XML Schema Production Rules](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_XMLSchemaProductionRules.pdf) | 应使用匹配版本的官方完整schema作结构验收；本次库中未找到XSD，不得把XML语法解析称为官方XSD通过 |
| Dem与UDS约束 | `bswmd/dem_bswmd.json` 中定义说明与范围；SWS/ISO条文需逐规则引用 | 不能把旧手写R001–R008无条件推广到官方4.4.0；未拿到ISO原文的特定约束不得编造条款 |

验收应区分：XML语法合法、匹配XSD、配置语义/引用完整、第三方工具互操作、供应商代码集成。这五层不能相互替代。用户已接受暂未验证后两项；前几层仍须按范围真实验证。

## 已保存证据索引

- 基线命令：`.temp/baseline-20261103-tests.json`（原始测试报告），00-STATUS中的build结果；最终交付前需再运行新提交。
- `evidence/local-legacy-load-error.dom.txt`：原库兼容错误。
- `evidence/local-export-after-validation.dom.txt`：已确认10项、仍有28项未配置；ARXML具体阻断列表。
- `evidence/local-official-dem.jpg`：本地官方Dem运行界面。
- `evidence/reference-modules.dom.txt`：对标模块目录及11个已加入模块、生成/校验开关。
- `.codex/references/easysar-2026-11-03/`：实际登录导航、参数页、引用空态、菜单和截图hash。
- `C:/Users/Pointer/Downloads/研究验证_20261103.json`：本轮隔离测试库的真实下载，不含原用户库数据。

证据的用途是复现，不能把“有截图”当成功，也不能把未验证清单改成已通过。持续更新时保留历史基线和差异。
