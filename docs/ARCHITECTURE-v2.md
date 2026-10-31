# AUTOSAR BSW Config Tool - 架构设计 v2.0

> 基于 DaVinci/ETAS 等工具的调研重构

## 1. 核心概念

### 1.1 BSW 配置器的本质

BSW 配置器不是简单的"表单编辑器"，而是：

```
┌─────────────────────────────────────────────────────────────────┐
│                    BSW Configuration Tool                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │   BSWMD      │ → │ Configuration│ → │  Generator   │        │
│  │   Parser     │   │   Editor     │   │  (Template)  │        │
│  │ (ARXML输入)   │   │ (UI/Validation)│  │ (代码输出)    │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         ↑                  ↓                  ↓                  │
│         └──────────┬───────┘                  │                  │
│                    ↓                          │                  │
│            ┌──────────────┐                  │                  │
│            │ Constraint   │──────────────────┘                  │
│            │ Validator    │ (Python/TS)                          │
│            └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 关键概念对照

| 概念 | 说明 | 对应实现 |
|------|------|----------|
| **BSWMD** | BSW Module Description (ARXML) | 解析为内存中的参数定义树 |
| **ECUC Container** | 参数的容器（如 DemConfigSet）| JSON/Object 嵌套结构 |
| **ECUC Parameter** | 实际参数（类型/范围/默认值）| 带元数据的值 |
| **Reference** | 参数间引用（如 DTC → Attributes）| UUID 引用 + 完整性检查 |
| **Configuration Class** | PreCompile/LinkTime/PostBuild | 生成策略控制 |
| **Variant** | 变体配置 | 条件编译支持 |
| **Constraint** | 约束规则 | Python/TS 验证脚本 |

## 2. 系统架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Layer 5: UI Layer                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Config Tree │ │ Form Editor │ │ Graph View  │ │ Validator │ │
│  │ (ARXML结构)  │ │ (参数编辑)   │ │ (引用关系)  │ │ (错误面板) │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Layer 4: Application Layer                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Configuration Service                   │ │
│  │  (加载/保存/验证/生成/变体管理/历史记录)                     │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                       Layer 3: Domain Layer                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │    BSW      │ │    RTE      │ │   Variant   │ │  History  │ │
│  │   Module    │ │  Generator  │ │   Manager   │ │  Manager  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Layer 2: Infrastructure Layer              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ ARXML       │ │  Template   │ │ Constraint  │ │  Python   │ │
│  │  Parser     │ │   Engine    │ │   Engine    │ │  Runtime  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Layer 1: Storage Layer                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  IndexedDB  │ │  LocalFile  │ │   Git       │ │  Export   │ │
│  │ (Config)    │ │ (BSWMD)     │ │  (Diff)     │ │  (ARXML)  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
Input BSWMD (.arxml)
       ↓
┌──────────────┐
│ ARXML Parser │ → Parameter Definition Tree (内存中的元数据)
└──────────────┘
       ↓
┌──────────────────┐
│ Config Editor UI │ ← 用户编辑配置值
└──────────────────┘
       ↓
┌──────────────────┐
│ Constraint Check │ ← Python/TS 验证规则
└──────────────────┘
       ↓
┌──────────────────┐
│ Code Generator   │ → _Cfg.h, _PBCfg.c (模板生成)
└──────────────────┘
       ↓
Output Source Files
```

## 3. 核心模块设计

### 3.1 BSWMD Parser (关键！)

```typescript
// src/core/bswmd/BswmdParser.ts

interface BswmdModule {
  shortName: string;
  version: string;
  containers: BswmdContainer[];
}

interface BswmdContainer {
  shortName: string;
  uuid: string;
  multiplicity: { lower: number; upper: number };
  parameters: BswmdParameter[];
  subContainers: BswmdContainer[];
  references: BswmdReference[];
}

interface BswmdParameter {
  shortName: string;
  type: 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'FUNCTION';
  configClass: 'PRE_COMPILE' | 'LINK_TIME' | 'POST_BUILD';
  defaultValue?: any;
  range?: { min: number; max: number };
  enumValues?: string[];
  isOptional: boolean;
}

interface BswmdReference {
  shortName: string;
  destination: string; // 引用目标容器类型
  isOptional: boolean;
}

// 解析 AUTOSAR_ECUC.xsd 定义的 BSWMD
export function parseBswmd(arxmlContent: string): BswmdModule;
```

### 3.2 Configuration Model

```typescript
// src/core/config/ConfigModel.ts

// 运行时的配置实例
interface ConfigInstance {
  module: string; // 如 "Dem"
  containers: ConfigContainer[];
}

interface ConfigContainer {
  definitionRef: string; // 引用 BswmdContainer.uuid
  shortName: string;
  uuid: string;
  parameters: ConfigParameter[];
  subContainers: ConfigContainer[];
  references: ConfigReference[];
}

interface ConfigParameter {
  definitionRef: string; // 引用 BswmdParameter
  value: any;
  isConfigured: boolean;
}

interface ConfigReference {
  definitionRef: string;
  targetUuid: string; // 引用的容器 UUID
}
```

### 3.3 Constraint Engine (Python + TS 双模式)

```typescript
// src/core/constraint/ConstraintEngine.ts

interface ConstraintRule {
  id: string;
  name: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  scope: 'PARAMETER' | 'CONTAINER' | 'MODULE' | 'GLOBAL';
  // 可以是 TS 函数或 Python 脚本
  check: (context: ConstraintContext) => ConstraintResult[];
}

// 示例约束：DTC Value 唯一性
const dtcValueUniqueRule: ConstraintRule = {
  id: 'DEM-001',
  name: 'DTC Value must be unique',
  severity: 'ERROR',
  scope: 'MODULE',
  check: (ctx) => {
    const dtcValues = new Set<number>();
    const errors: ConstraintResult[] = [];
    
    ctx.module.containers
      .filter(c => c.definitionRef === 'DemDTC')
      .forEach(dtc => {
        const value = dtc.parameters.find(p => p.definitionRef === 'DemDtcValue')?.value;
        if (dtcValues.has(value)) {
          errors.push({ container: dtc.uuid, message: `Duplicate DTC value: 0x${value.toString(16)}` });
        }
        dtcValues.add(value);
      });
    
    return errors;
  }
};
```

**Python 模式**：
```python
# src-python/constraints/dem_constraints.py

def check_aging_dependency(config: dict) -> list[Violation]:
    """
    R-008: If DemAgingAllowed=true, DemAgingCycleRef must be configured
    """
    violations = []
    for dtc_attr in config.get('dem_dtc_attributes', []):
        if dtc_attr.get('dem_aging_allowed') and not dtc_attr.get('dem_aging_cycle_ref'):
            violations.append(Violation(
                path=f"DemDTCAttributes/{dtc_attr['short_name']}",
                rule_id='R-008',
                message='DemAgingCycleRef is required when DemAgingAllowed is true',
                severity='ERROR'
            ))
    return violations
```

### 3.4 Template Engine (代码生成)

```typescript
// src/core/generator/TemplateEngine.ts

// 使用 Handlebars/EJS 风格模板
interface CodeTemplate {
  name: string;
  filePattern: string; // "{module}_Cfg.h"
  content: string; // 模板字符串
  // 如：
  // #ifndef {{moduleUpper}}_CFG_H
  // #define {{moduleUpper}}_CFG_H
  // {{#each containers}}
  // #define {{shortName}} {{value}}
  // {{/each}}
  // #endif
}

export function generateCode(
  config: ConfigInstance,
  bswmd: BswmdModule,
  templates: CodeTemplate[]
): GeneratedFile[];
```

**生成示例**（Dem_Cfg.h）：
```c
#ifndef DEM_CFG_H
#define DEM_CFG_H

/* Number of DTCs */
#define DEM_CFG_NUM_DTCS 10

/* DTC Configuration */
#define DEM_DTC_0x123456_SEVERITY DEM_SEVERITY_CHECK_IMMEDIATELY
#define DEM_DTC_0x123456_ATTRIBUTES_REF DemDTCAttributes_Default

/* Debounce Configuration */
#define DEM_DEBOUNCE_COUNTER_DEFAULT_FAILED_THRESHOLD 127
#define DEM_DEBOUNCE_COUNTER_DEFAULT_PASSED_THRESHOLD -127

#endif /* DEM_CFG_H */
```

## 4. 功能模块规划

### Phase 1: 基础骨架 ✅（已完成）
- [x] Vue 3 + TypeScript 项目
- [x] 基础数据模型（硬编码 DEM）
- [x] Pinia Store

### Phase 2: BSWMD 解析器 (P0)
- [ ] ARXML Schema 解析
- [ ] BSWMD → 内存模型
- [ ] 支持标准 AUTOSAR 模块（Dem, Dcm, NvM, Can, Com...）
- [ ] 动态 UI 生成（从 BSWMD 自动生成表单）

### Phase 3: 配置编辑器 (P0)
- [ ] 三栏布局（Tree/Form/Help）
- [ ] 智能表单（根据参数类型自动选择控件）
- [ ] 引用关系图（Vue Flow）
- [ ] 实时验证
- [ ] 撤销/重做

### Phase 4: 约束引擎 (P1)
- [ ] TS 约束规则框架
- [ ] Python 约束运行时（WebAssembly/Pyodide）
- [ ] 内置规则库（AUTOSAR SWS 约束）
- [ ] 自定义规则

### Phase 5: 代码生成器 (P1)
- [ ] 模板引擎（Handlebars）
- [ ] C 代码生成（_Cfg.h, _PBCfg.c）
- [ ] ARXML 导出
- [ ] 变体支持（Variants）

### Phase 6: 高级功能 (P2)
- [ ] 变体管理（PreCompile/LinkTime/PostBuild）
- [ ] 导入 OEM 系统描述
- [ ] Diff/Merge
- [ ] CLI 自动化
- [ ] 报告生成

## 5. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 前端框架 | Vue 3 + TS | 王上熟悉 |
| UI 库 | Element Plus | 成熟 |
| ARXML 解析 | fast-xml-parser | 轻量 |
| Schema 验证 | json-schema | 约束定义 |
| 模板引擎 | Handlebars | 代码生成 |
| Python 运行时 | Pyodide (WASM) | 浏览器内运行 Python |
| 图形 | @vue-flow/core | 引用关系图 |
| 存储 | LocalForage | IndexedDB 封装 |
| 状态管理 | Pinia | Vue 官方 |

## 6. 关键设计决策

### ADR-001: BSWMD 驱动 UI
- **决策**: UI 不从代码写死，而是从 BSWMD 动态生成
- **理由**: 支持任意 AUTOSAR 模块，无需为每个模块写代码
- **代价**: 需要完整的 ARXML 解析器

### ADR-002: Python 约束引擎
- **决策**: 约束规则用 Python 编写，浏览器内通过 Pyodide 运行
- **理由**: 
  - Python 更适合写复杂验证逻辑
  - 可以复用现有 AUTOSAR 验证脚本
  - 比纯 TS 更易维护
- **代价**: 引入 Pyodide (~5MB)，首次加载慢

### ADR-003: 模板化代码生成
- **决策**: 使用 Handlebars 模板生成 C 代码
- **理由**: 
  - 模板可自定义
  - 支持不同 BSW 实现（Vector/ETAS/国产）
- **代价**: 需要维护模板库

## 7. 下一步行动

1. **BSWMD 解析器**：从那个 14.7MB 的 ARXML 文件解析出参数定义
2. **动态 UI**：根据解析结果自动生成配置表单
3. **Python 约束**：搭建 Pyodide 运行时

---

**参考**
- AUTOSAR RS ECU Configuration
- DaVinci Configurator Classic 文档
- AutoPie Studio 功能介绍
