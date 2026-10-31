# TASK-010 契约澄清 — 评审方误判与撤销

> 本文件针对 Codex 于 2026-10-31T20:49 提交的 `blocked` 回执与 `.codex/reports/TASK-010-REPORT.md` 作出裁定。
> **不是产品评审**（本轮无提交物）；这是架构决策层的澄清与认错。

| 项 | 值 |
|---|---|
| 触发 | `blocked-205fe3c7b35eceb2045a4a65`：TASK-010 被阻塞，理由「A1 与官方 CHOICE 示例冲突，需 WorkBuddy 澄清契约」 |
| 裁定 | **Codex 正确，评审方错误。A1 撤销。** |
| 契约 | 修订为 v2，新 contractHash `197053e3bb8a232edb599306a7a8cc9c4a2274dcfdbd0e123b048506f76ff2e2` |

---

## 一、我错在哪

上一轮我对 TASK-009 提出 🟠-1：

> 导出的 CHOICE 实例用 `<ECUC-CONTAINER-VALUE>` 承载，`DEFINITION-REF` 的 `DEST` 却标 `ECUC-CHOICE-CONTAINER-DEF` —— 元素类型与定义引用类型不对应，第三方工具可能拒收。

**这个判断是凭直觉，不是凭规范**：我看到 `CONTAINER-VALUE` 就认为它必须配 `PARAM-CONF-CONTAINER-DEF`，没有去查「值侧」是怎么规定的。

**官方规范直接推翻了我。** AUTOSAR CP R24-11 TPS_ECUConfiguration，印刷页 129，`[TPS_ECUC_03020]` 原文：

> On the Value side a `EcucChoiceContainerDef` is **treated as a usual container**, though it depends on the upperMultiplicity of the EcucChoiceContainerDef how often the choice can be taken. **Which choice has been taken is defined by the `<DEFINITION-REF>` of the `<SUB-CONTAINER>`.**

`Example 2.33` 的值侧片段：

```xml
<ECUC-CONTAINER-VALUE>
  <SHORT-NAME>myGwSource001</SHORT-NAME>
  <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/AUTOSAR/EcucDefs/Com/…/ComGwSource</DEFINITION-REF>
  <SUB-CONTAINERS> …
```

也就是说：**值侧本就该用普通容器元素 + `CHOICE-CONTAINER-DEF` 的 DEST**，选中哪个候选由子容器的 `DEFINITION-REF` 表达。当前实现写的正是标准写法，没有问题可修。

我先前只读了 §2.3.3.1（定义侧互斥），就推断值侧写法，属于**用定义侧约束臆测值侧表达**。这是方法错误。

---

## 二、Codex 的处理值得记录

它没有盲从我的错误要求，而是：

1. 查了官方规范，给出**版本 + 章节 + 条款号 + 印刷页码**（R4.3.1 §2.4.3.1 / TPS_ECUC_03020 / Example 2.33 / 页 123–124）；
2. **交叉验证三个版本**（R4.1.3 §2.4.3.1 页 111、R24-11 §2.4.3.1）；
3. 明确标注**证据边界**：「本轮 R4.2.2 官方 PDF URL 两次获取超时，未取得该版本完整 XSD；不把邻近版本核查说成完成了 R4.2.2 XSD 验证」；
4. 指出我验证方法的局限：「DOMParser 无 parsererror 只能证明 XML 良构，不能独立证明 AUTOSAR 模型/Schema 合规」——**这句直接点破了我上一轮验收手段的不足**；
5. 按 AGENTS §7 / DIVISION §六 停在架构决策处，**未改代码、未改 STATE、未改契约、未伪称提交**。

这正是我要的协作方式。**停工不计其责。**

---

## 三、契约修订内容（v2）

| 原内容 | 处置 |
|---|---|
| A1 改 CHOICE 元素名（方案①/②） | ❌ **撤销**。且在红线中新增：不得引入 `ECUC-CHOICE-CONTAINER-VALUE` 等规范中不存在的元素名 |
| A2 旧格式兼容 | ✅ 保留（现为 A4） |
| A3 顺序稳定 | ✅ 保留（现为 A1） |
| A4 覆盖率提示 | ✅ 保留（现为 A2） |
| A5 独立校验入测试 | ✅ 保留（现为 A3），断言内容改为**对照 `Example 2.33` 结构**，不再自创 |
| 原验收 1（元素名与 DEST 自洽） | ❌ **撤销** |
| B1–B5 引用图与拖拽 | ✅ 保留不变 |

新 A 组只有 4 项，且不含格式改写，工作量小。

---

## 四、另一个阻塞：执行环境权限

Codex 报告本机 `esbuild` 子进程与 Git 索引写入被拒：

```
Error: spawn EPERM at ensureServiceIsRunning (.../esbuild/lib/main.js:1975)
fatal: Unable to create '.git/index.lock': Permission denied
```

`npm test`、`npm run build`、`git add` 全部失败。它按「遇权限拒绝返回 blocked、不绕过」的要求停工。

**这不是代码问题，也不是契约问题。** 我在评审侧同一台机器上运行 `npm run build`、`npm test`、`git commit` 均正常（本轮 252 用例全绿），说明是 **Codex 侧执行环境的权限被收紧**，需要用户在其桌面端恢复（或以具备写权限的方式重启 Codex）。

恢复条件：`esbuild` 子进程可 `spawn`、`.git/index.lock` 可创建。

---

## 五、流程缺口（我要修的）

这次我从 20:46 挂监听，一直等到 23:46 窗口到期（3 小时），**而这期间 Codex 早在 20:49 就报了 blocked**。

根因：`blocked` 不会触发 resident 投递，只有 `review` 请求才会。我在等一个永远不会来的事件。

**已加入自检清单**（写入 `.codex/autodev/WORKBUDDY.md`）：每次监听结束（无论 `outcome=timeout` 还是收到事件），都必须检查：

- `.temp/autodev/attention.json`
- `.temp/autodev/events.jsonl` 末尾
- `.codex/STATE.json` 的 `task.status`

三者任一显示异常，立即处理，不再进入下一轮盲等。

---

## 六、恢复后的动作

Codex 侧权限恢复后，按 v2 契约重跑 TASK-010：

```
node scripts/autodev/dispatch.mjs recover
powershell -NoProfile -File scripts/autodev/start.ps1
```

契约哈希已更新为 `197053e3…`，调度器派发前会校验一致。
