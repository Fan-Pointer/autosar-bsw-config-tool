# TASK-014 实测发现：旧官方 ARXML 成功用例缺必填引用

Codex，2026-11-06。等待 WorkBuddy 裁定；不放宽输出闸门。

统一闸门复用既有 DefinitionConstraints 后，268 项首跑 255 pass / 13 fail。
其中 3 个旧用例的“成功导出”前提是只确认参数、遗漏必填跨模块引用：

- `arxml-fidelity.test.ts` CanIf 45 参数往返：CanIfCtrlDrvInitHohConfigRef、CanIfCtrlDrvNameRef、CanIfCtrlCanCtrlRef 都必填且指向其他模块。
- `choice.test.ts` NvM 候选 0/1：NvMNameOfEaBlock / NvMNameOfFeeBlock 为必填外部引用。

这是旧导出器只拦截必填参数的真实漏检，不能用虚构当前模块目标、修改官方定义的可选性或绕过闸门维持旧“通过”。

建议裁定：

1. 三项官方用例改为明确验证必填外部引用逐项拒绝，同时 JSON 往返全树/值/引用/CHOICE/时间戳无损；名称同步记录旧新映射。
2. 原有通用 CHOICE 两候选 ARXML 往返断言全部保留；补可输出的 CanIf 官方子集（仅删除 lower=0 的驱动配置实例，不改定义）来保留 45 参数与导出保真覆盖，或明确将原成功路径留待跨模块方案支持后再验收。
3. 本期已明确跨模块引用不支持，所以应把此限制写进验证/交付说明，不承诺 NvM/CanIf 任意配置完整输出。
4. 官方 Dem 失败另为 2 个模块内必填引用遗漏，可构造合法 OperationCycle / EventMemorySet 并关联，继续保留官方成功往返。

其余 9 处是夹具默认值/缓存引用没有显式 isConfigured=true、CSV 字符串转义测试借用非法 ENUM，以及 C 字符串转义场景被无关 ARXML 实例命名预校验误阻止。分别补合法确认前置、使用合成 STRING 语义、保留格式编码边界与业务就绪检查的分层；不删原行为断言。

请 WorkBuddy 明确上述三项旧官方用例的修订边界，并保留原成功能力的未完成记录。

## 原始定义复核纠正（2026-11-06）

Codex 上面的“CanIfCtrlDrvCfg lower=0 可删除”建议有误，不能采用。
`tests/fixtures/ecuc-canif.arxml:27–33` 原文 SHORT-NAME=CanIfCtrlDrvCfg，
LOWER-MULTIPLICITY=**1**，UPPER-MULTIPLICITY-INFINITE=true。
所以既不能用生命周期接口移除它，也不能直接删实例树伪造合法子集。
请撤销 v3 A4 的此行，保留真实 CanIf 必填引用拒绝与 JSON 取回；
CanIf 完整成功业务输出应如实记为当前未支持。成功 ARXML/C 集合验收使用官方 Dem 与合成通用夹具。

另：CanIfCtrlDrvInitHohConfigRef 是模块内目标，我在本报告初始描述把它和另两个引用一起称为“跨模块”不准确；v3 的分类纠正正确，后续断言按 v3 区分。

## 已收到裁定

WorkBuddy 已真实收到上述纠正，并在 `c7663df` 下发 v4 契约及重绑哈希。最终实现和测试按 v4 执行；本文保留早期错误和更正的完整过程，不再处于等待澄清状态。
