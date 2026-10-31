# Task-002: BSWMD 解析器与动态配置引擎

## 任务元信息
- **编号**: Task-002
- **优先级**: P0
- **预估工时**: 3-4 天
- **前置任务**: Task-001（项目骨架已完成）
- **验收人**: 王上 + 锻码师（架构评审）

---

## 1. 背景与目标

### 1.1 背景
本项目是基于网页的 AUTOSAR BSW 配置工具，对标 Vector DaVinci Configurator。
核心技术栈：Vue 3 + TypeScript + Pinia + Element Plus + Vite。

### 1.2 目标
实现 BSWMD（BSW Module Description）解析器与动态配置引擎：
1. 解析 BSWMD 参数定义（从 JSON/ARXML）
2. 动态生成配置 UI（表单、树、引用）
3. 支持参数约束验证
4. 生成符合 AUTOSAR 规范的 C 代码

---

## 2. 核心架构

### 2.1 分层设计
```
src/core/
├── bswmd/        # BSWMD 解析（ARXML/JSON → 参数定义树）
├── config/       # 配置实例管理
├── constraint/   # 约束引擎（TS + Python）
├── generator/    # 代码生成（模板 → C/ARXML）
└── variant/      # 变体管理
```

### 2.2 数据流
```
BSWMD JSON → Parser → Config Instance → Constraint Check → C Code
                         ↓
                  Dynamic Form (Vue)
```

---

## 3. 必须交付的文件

| # | 文件路径 | 说明 |
|---|----------|------|
| 1 | `src/core/bswmd/BswmdTypes.ts` | BSWMD 类型定义（核心） |
| 2 | `src/core/bswmd/BswmdParser.ts` | BSWMD 解析器 |
| 3 | `src/core/bswmd/BswmdLoader.ts` | BSWMD 加载器 |
| 4 | `src/core/config/ConfigTypes.ts` | 配置实例类型 |
| 5 | `src/core/config/ConfigInstance.ts` | 配置实例管理 |
| 6 | `src/core/constraint/ConstraintTypes.ts` | 约束类型定义 |
| 7 | `src/core/constraint/ConstraintEngine.ts` | 约束引擎 |
| 8 | `src/core/constraint/DemConstraints.ts` | DEM 内置约束规则 |
| 9 | `src/core/generator/TemplateEngine.ts` | Handlebars 模板引擎 |
| 10 | `src/core/generator/CGenerator.ts` | C 代码生成器 |
| 11 | `src/ui/FormEditor/DynamicForm.vue` | 动态表单组件 |
| 12 | `src/ui/ConfigTree/ConfigTree.vue` | 配置树组件 |
| 13 | `src/ui/Validator/ValidationPanel.vue` | 验证面板组件 |
| 14 | `bswmd/dem_bswmd.json` | DEM BSWMD 参数定义 |

---

## 4. 详细实现要求

### 4.1 BSWMD 类型定义（BswmdTypes.ts）
```typescript
export type EcucParameterType =
  | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'FUNCTION' | 'REFERENCE';

export type ConfigClass = 'PRE_COMPILE' | 'LINK_TIME' | 'POST_BUILD';

export interface BswmdModule {
  shortName: string;
  version: string;
  description?: string;
  containers: BswmdContainer[];
}

export interface BswmdContainer {
  uuid: string;
  shortName: string;
  multiplicity: { lower: number; upper: number | 'unbounded' };
  parameters: BswmdParameter[];
  references: BswmdReference[];
  subContainers: BswmdContainer[];
}

export interface BswmdParameter {
  uuid: string;
  shortName: string;
  type: EcucParameterType;
  configClass: ConfigClass;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  enumValues?: string[];
  isOptional: boolean;
}

export interface BswmdReference {
  uuid: string;
  shortName: string;
  destinationContainerType: string;
  isOptional: boolean;
}
```

### 4.2 BSWMD 解析器（BswmdParser.ts）
- 从 JSON 字符串解析为 BswmdModule
- 支持递归嵌套容器
- 完整的类型校验和错误处理

### 4.3 BSWMD 加载器（BswmdLoader.ts）
- 从 URL/字符串/File 加载 BSWMD
- 模块缓存机制

### 4.4 配置实例管理（ConfigInstance.ts）
- 从 BSWMD 创建空配置实例
- 递归创建容器和参数
- 提供参数值/引用设置方法

### 4.5 约束引擎（ConstraintEngine.ts + DemConstraints.ts）
- 可扩展规则注册机制
- DEM 内置规则（DEM-001~DEM-008）

### 4.6 代码生成器（CGenerator.ts）
- Handlebars 模板引擎
- 生成 C Header 和 Source 文件

### 4.7 UI 组件
- DynamicForm.vue：根据参数类型自动渲染控件
- ConfigTree.vue：展示 BSWMD 结构树
- ValidationPanel.vue：显示验证结果

### 4.8 DEM BSWMD 定义（dem_bswmd.json）
- 包含 DemConfigSet、DemDTC、DemDTCAttributes、DemEventParameter、DemDebounce 等容器定义

---

## 5. 验收标准

### 5.1 功能验收
- [ ] `BswmdParser.parseFromJson()` 能正确解析 `dem_bswmd.json`
- [ ] `BswmdLoader.loadFromString()` 能加载模块
- [ ] `ConfigInstanceManager.createFromBswmd()` 能创建配置实例
- [ ] `DynamicForm` 能根据 BSWMD 渲染正确类型的表单控件
- [ ] `ConstraintEngine` 能运行约束规则并返回违规列表
- [ ] `CGenerator` 能生成有效的 C Header 文件
- [ ] 所有 TypeScript 类型正确，无 `any` 滥用

### 5.2 代码质量
- [ ] 通过 `npm run build` 无错误
- [ ] ESLint 无错误（warning 可接受）
- [ ] 所有导出函数有 JSDoc 注释
- [ ] 复杂逻辑有行内注释

---

## 6. 约束与红线

- ❌ 禁止使用 `any` 类型（除非绝对必要且有注释）
- ❌ 在核心引擎中引入 Vue 依赖（保持纯 TS）
- ❌ 硬编码模块特定逻辑（保持通用性）
- ✅ BSWMD 解析器必须支持递归嵌套容器
- ✅ 配置实例必须保留对 BSWMD 的引用（definitionRef）
- ✅ UUID 必须使用 `uuid` 库生成

---

## 7. 参考资源

- 项目已有类型定义：`src/types/base.ts`
- UUID 工具：`src/utils/uuid.ts`
- 架构文档：`docs/ARCHITECTURE-v2.md`
- DEM BSWMD 示例：`bswmd/dem_bswmd.json`

---

## 8. 交付说明

完成后：
1. 运行 `npm install` 安装依赖
2. 运行 `npm run build` 验证编译
3. 提交到 `feature/task-002-bswmd-parser` 分支
4. 创建 Pull Request

**注意**：这是核心引擎模块，代码质量要求较高。请仔细阅读需求文档，确保实现完整。
