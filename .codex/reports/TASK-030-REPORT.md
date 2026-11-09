# TASK-030 实现报告 — C 批次首批：G44 工程级导出

- 需求来源：需求文档 v3.0 FR-28（工程 ARXML / 工程包）

## 交付

| 项 | 实现 |
|---|---|
| 工程 ARXML | `exportProjectArxml(entries)`：把工程内全部模块配置合入**一个 AUTOSAR 文档**（同一 AR-PACKAGE，多段 ECUC-MODULE-CONFIGURATION-VALUES）；任一模块未过输出闸门则**整体拒绝**并列出模块名与原因（不产出半成品） |
| 工程包 zip | `buildProjectPackage()`：`project.arxml` + `modules/<模块>.arxml` + `code/<模块>_Cfg.h/.c` + `manifest.json`（含 skipped 记录）；单模块 C 生成失败不阻断整包，记入清单 |
| ZIP 写入器 | `src/core/io/Zip.ts`：零依赖 STORE 型 zip（本地头 + 中央目录 + EOCD，UTF-8 标记），CRC-32 用标准向量自测 |
| 入口 | 工程右键 → 导出 → 新增「工程 ARXML（全部模块）」「工程包（ZIP：ARXML+C）」 |
| store | `projectExportEntries()`（无工程时退化为当前配置集）、`exportProjectArxmlContent()`、`exportProjectPackageContent()` |

## 验证

- typecheck ✓；**373/373 全过（31 文件）**，含新增 `tests/project-package.test.ts` 4 用例
  （多模块合并单根、闸门整包拒绝、zip 签名与条目、CRC-32 标准向量）
- `io-ui` 导出子菜单断言更新为 5 项（原 3 格式 + 2 工程级）

## 未做（如实声明）

- 「验证所有工程」「关闭所有工程」（FR-33）未实现，下一批
- 工程包未包含工程级 JSON 备份（当前只有 ARXML + C + manifest）
