# Task-002: BSWMD 解析器与动态配置引擎

## 任务元信息
- **编号**: Task-002
- **优先级**: P0
- **预估工时**: 3-4 天
- **前置任务**: Task-001 (已完成)
- **验收人**: 王上 + 锻码师

---

## 1. 背景与目标

### 1.1 背景
Task-001 已完成项目骨架和硬编码的 DEM 模型。现在需要转向**真正的 BSW 配置器架构**：
- 从硬编码模型 → **BSWMD 驱动**
- 从静态表单 → **动态生成 UI**
- 从固定规则 → **可扩展约束**

### 1.2 目标
实现 BSWMD（BSW Module Description）解析器，能够：
1. 解析 BSWMD 参数定义（从 JSON/ARXML）
2. 动态生成配置 UI（表单、树、引用）
3. 支持参数约束验证
4. 生成符合 AUTOSAR 规范的 C 代码

---

## 2. 核心概念

### 2.1 BSWMD 结构
```
BSWMD (BSW Module Description)
├── Module (如 Dem, Dcm, NvM)
│   ├── Containers (容器)
│   │   ├── Parameters (参数: INTEGER, FLOAT, BOOLEAN, STRING, ENUM, FUNCTION)
│   │   ├── References (引用到其他容器)
│   │   └── SubContainers (嵌套容器)
│   └── Variants (变体: PreCompile/LinkTime/PostBuild)
```

### 2.2 配置实例
```
ConfigInstance (运行时配置)
├── moduleRef: string (指向 BSWMD)
├── containers: ConfigContainer[]
│   ├── definitionRef: string (指向 BSWMD Container)
│   ├── parameters: { [defRef]: value }
│   └── references: { [defRef]: targetUuid }
```

---

## 3. 技术要求

### 3.1 文件清单

必须实现的文件（12 个）：

| # | 文件路径 | 说明 |
|---|----------|------|
| 1 | `src/core/bswmd/BswmdTypes.ts` | BSWMD 类型定义（核心） |
| 2 | `src/core/bswmd/BswmdParser.ts` | BSWMD 解析器 |
| 3 | `src/core/bswmd/BswmdLoader.ts` | BSWMD 加载器（从文件/JSON） |
| 4 | `src/core/config/ConfigTypes.ts` | 配置实例类型 |
| 5 | `src/core/config/ConfigInstance.ts` | 配置实例管理 |
| 6 | `src/core/constraint/ConstraintTypes.ts` | 约束类型定义 |
| 7 | `src/core/constraint/ConstraintEngine.ts` | 约束引擎（TS 实现） |
| 8 | `src/core/generator/TemplateEngine.ts` | Handlebars 模板引擎 |
| 9 | `src/core/generator/CGenerator.ts` | C 代码生成器 |
| 10 | `src/ui/FormEditor/DynamicForm.vue` | 动态表单组件 |
| 11 | `src/ui/ConfigTree/ConfigTree.vue` | 配置树组件 |
| 12 | `bswmd/dem_bswmd.json` | DEM BSWMD 参数定义 |

### 3.2 详细实现要求

#### 文件 1: BswmdTypes.ts
```typescript
// BSWMD 核心类型定义

export type EcucParameterType = 
  | 'INTEGER' 
  | 'FLOAT' 
  | 'BOOLEAN' 
  | 'STRING' 
  | 'ENUM' 
  | 'FUNCTION';

export type ConfigClass = 
  | 'PRE_COMPILE' 
  | 'LINK_TIME' 
  | 'POST_BUILD';

export interface BswmdModule {
  shortName: string;
  version: string;
  description?: string;
  containers: BswmdContainer[];
}

export interface BswmdContainer {
  uuid: string;
  shortName: string;
  description?: string;
  // Multiplicity: 1, 0..1, 0..n, 1..n
  multiplicity: {
    lower: number;
    upper: number | 'unbounded';
  };
  parameters: BswmdParameter[];
  references: BswmdReference[];
  subContainers: BswmdContainer[];
}

export interface BswmdParameter {
  uuid: string;
  shortName: string;
  description?: string;
  type: EcucParameterType;
  configClass: ConfigClass;
  // 值约束
  defaultValue?: any;
  min?: number;
  max?: number;
  // ENUM 类型专用
  enumValues?: string[];
  // 是否可选
  isOptional: boolean;
}

export interface BswmdReference {
  uuid: string;
  shortName: string;
  description?: string;
  // 引用目标容器类型
  destinationContainerType: string;
  isOptional: boolean;
}
```

#### 文件 2: BswmdParser.ts
```typescript
// BSWMD 解析器 - 从 JSON/ARXML 解析为内存模型

import type { BswmdModule, BswmdContainer, BswmdParameter } from './BswmdTypes';

export class BswmdParser {
  /**
   * 从 JSON 字符串解析 BSWMD
   */
  parseFromJson(jsonString: string): BswmdModule {
    const data = JSON.parse(jsonString);
    return this.parseModule(data);
  }

  /**
   * 解析模块根节点
   */
  private parseModule(data: any): BswmdModule {
    // 实现解析逻辑
    return {
      shortName: data.shortName,
      version: data.version,
      description: data.description,
      containers: data.containers.map((c: any) => this.parseContainer(c))
    };
  }

  /**
   * 递归解析容器
   */
  private parseContainer(data: any): BswmdContainer {
    // 实现递归解析
    // 注意处理 subContainers 递归
  }

  /**
   * 从 ARXML 解析（使用 fast-xml-parser）
   */
  parseFromArxml(arxmlString: string): BswmdModule {
    // TODO: 实现 ARXML 解析
    // 提示: 使用 fast-xml-parser 库
    throw new Error('ARXML parsing not yet implemented');
  }
}
```

#### 文件 3: BswmdLoader.ts
```typescript
// BSWMD 加载器 - 管理 BSWMD 文件

import type { BswmdModule } from './BswmdTypes';
import { BswmdParser } from './BswmdParser';

export class BswmdLoader {
  private parser = new BswmdParser();
  private loadedModules: Map<string, BswmdModule> = new Map();

  /**
   * 从 URL 加载 BSWMD（fetch）
   */
  async loadFromUrl(url: string): Promise<BswmdModule> {
    const response = await fetch(url);
    const json = await response.text();
    const module = this.parser.parseFromJson(json);
    this.loadedModules.set(module.shortName, module);
    return module;
  }

  /**
   * 从字符串加载
   */
  loadFromString(jsonString: string): BswmdModule {
    const module = this.parser.parseFromJson(jsonString);
    this.loadedModules.set(module.shortName, module);
    return module;
  }

  /**
   * 获取已加载的模块
   */
  getModule(name: string): BswmdModule | undefined {
    return this.loadedModules.get(name);
  }

  /**
   * 列出所有已加载模块
   */
  listModules(): string[] {
    return Array.from(this.loadedModules.keys());
  }
}
```

#### 文件 4: ConfigTypes.ts
```typescript
// 配置实例类型 - 运行时用户配置

import type { UUID } from '@/types/base';

export interface ConfigInstance {
  uuid: UUID;
  moduleRef: string; // 引用 BswmdModule.shortName
  version: string;
  containers: ConfigContainer[];
  // 元数据
  createdAt: number;
  lastModified: number;
}

export interface ConfigContainer {
  uuid: UUID;
  // 引用 BSWMD 定义
  definitionRef: string; // BswmdContainer.uuid
  shortName: string;
  description?: string;
  // 参数值
  parameters: Record<string, ConfigParameterValue>; // key: paramDefUuid
  // 引用关系
  references: Record<string, ConfigReferenceValue>; // key: refDefUuid
  // 子容器
  subContainers: ConfigContainer[];
}

export interface ConfigParameterValue {
  definitionRef: string; // BswmdParameter.uuid
  value: any;
  isConfigured: boolean; // 是否已配置（非默认值）
}

export interface ConfigReferenceValue {
  definitionRef: string; // BswmdReference.uuid
  targetUuid: UUID; // 引用的容器 UUID
}
```

#### 文件 5: ConfigInstance.ts
```typescript
// 配置实例管理 - 创建、操作、验证配置

import type { ConfigInstance, ConfigContainer } from './ConfigTypes';
import type { BswmdModule, BswmdContainer } from '@/core/bswmd/BswmdTypes';
import { generateUUID } from '@/utils/uuid';

export class ConfigInstanceManager {
  /**
   * 从 BSWMD 创建空配置实例
   */
  createFromBswmd(bswmd: BswmdModule): ConfigInstance {
    return {
      uuid: generateUUID(),
      moduleRef: bswmd.shortName,
      version: '1.0.0',
      containers: bswmd.containers.map(c => this.createContainerFromBswmd(c)),
      createdAt: Date.now(),
      lastModified: Date.now()
    };
  }

  /**
   * 递归创建容器实例
   */
  private createContainerFromBswmd(bswmdContainer: BswmdContainer): ConfigContainer {
    // 实现递归创建
    // 注意处理 subContainers
  }

  /**
   * 获取容器（按 UUID 或路径）
   */
  getContainer(instance: ConfigInstance, uuid: string): ConfigContainer | null {
    // 实现查找逻辑
    return null;
  }

  /**
   * 设置参数值
   */
  setParameterValue(
    container: ConfigContainer,
    paramDefUuid: string,
    value: any
  ): void {
    // 实现设置值逻辑
  }

  /**
   * 设置引用
   */
  setReference(
    container: ConfigContainer,
    refDefUuid: string,
    targetUuid: string
  ): void {
    // 实现设置引用逻辑
  }
}
```

#### 文件 6-7: 约束引擎
```typescript
// ConstraintTypes.ts
export interface ConstraintRule {
  id: string;
  name: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  scope: 'PARAMETER' | 'CONTAINER' | 'MODULE' | 'REFERENCE';
  // 约束检查函数
  check: (context: ConstraintContext) => ConstraintViolation[];
}

export interface ConstraintViolation {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  path: string; // 配置路径，如 "DemConfigSet/DemDTC_0/demDtcValue"
  message: string;
  suggestion?: string;
}

export interface ConstraintContext {
  configInstance: ConfigInstance;
  bswmdModule: BswmdModule;
  // 当前检查的目标
  target?: ConfigContainer | ConfigParameterValue;
}

// ConstraintEngine.ts
export class ConstraintEngine {
  private rules: ConstraintRule[] = [];

  registerRule(rule: ConstraintRule): void {
    this.rules.push(rule);
  }

  validate(context: ConstraintContext): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    for (const rule of this.rules) {
      try {
        const result = rule.check(context);
        violations.push(...result);
      } catch (e) {
        console.error(`Rule ${rule.id} failed:`, e);
      }
    }
    return violations;
  }
}

// DEM 内置约束规则示例
export const DemConstraints: ConstraintRule[] = [
  {
    id: 'DEM-001',
    name: 'DTC Value Unique',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx) => {
      const violations: ConstraintViolation[] = [];
      const dtcValues = new Map<number, string>();
      
      // 遍历所有 DemDTC 容器
      for (const container of ctx.configInstance.containers) {
        // 检查 DTC Value 唯一性
        // ...
      }
      
      return violations;
    }
  },
  {
    id: 'DEM-002',
    name: 'Aging Dependency',
    severity: 'ERROR',
    scope: 'CONTAINER',
    check: (ctx) => {
      // R-008: If DemAgingAllowed=true, DemAgingCycleRef must be set
      return [];
    }
  }
];
```

#### 文件 8-9: 代码生成器
```typescript
// TemplateEngine.ts
import Handlebars from 'handlebars';

export interface Template {
  name: string;
  filePattern: string; // 如 "{module}_Cfg.h"
  content: string;
}

export class TemplateEngine {
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  registerTemplate(name: string, template: string): void {
    this.templates.set(name, Handlebars.compile(template));
  }

  generate(templateName: string, data: any): string {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template ${templateName} not found`);
    return template(data);
  }
}

// CGenerator.ts
export class CGenerator {
  private templateEngine = new TemplateEngine();

  constructor() {
    // 注册 C Header 模板
    this.templateEngine.registerTemplate('c_header', `
#ifndef {{moduleUpper}}_CFG_H
#define {{moduleUpper}}_CFG_H

/* Generated by AUTOSAR BSW Config Tool */
/* Module: {{moduleName}} */
/* Version: {{version}} */

{{#each containers}}
/* {{shortName}} Configuration */
{{#each parameters}}
#define {{containerShortName}}_{{paramShortName}} {{value}}
{{/each}}

{{/each}}

#endif /* {{moduleUpper}}_CFG_H */
    `);
  }

  generateHeader(config: ConfigInstance, bswmd: BswmdModule): string {
    return this.templateEngine.generate('c_header', {
      moduleName: bswmd.shortName,
      moduleUpper: bswmd.shortName.toUpperCase(),
      version: config.version,
      containers: config.containers.map(c => ({
        shortName: c.shortName,
        parameters: Object.entries(c.parameters).map(([k, v]) => ({
          paramShortName: k,
          value: v.value
        }))
      }))
    });
  }
}
```

#### 文件 10-11: Vue 组件
```vue
<!-- DynamicForm.vue - 动态表单组件 -->
<template>
  <div class="dynamic-form">
    <el-form :model="formData" label-position="top">
      <!-- 根据 BSWMD 动态渲染表单 -->
      <template v-for="param in parameters" :key="param.uuid">
        <!-- INTEGER -->
        <el-form-item v-if="param.type === 'INTEGER'" :label="param.shortName">
          <el-input-number 
            v-model="formData[param.uuid]" 
            :min="param.min" 
            :max="param.max"
          />
        </el-form-item>
        
        <!-- ENUM -->
        <el-form-item v-else-if="param.type === 'ENUM'" :label="param.shortName">
          <el-select v-model="formData[param.uuid]">
            <el-option 
              v-for="val in param.enumValues" 
              :key="val" 
              :label="val" 
              :value="val"
            />
          </el-select>
        </el-form-item>
        
        <!-- BOOLEAN -->
        <el-form-item v-else-if="param.type === 'BOOLEAN'" :label="param.shortName">
          <el-switch v-model="formData[param.uuid]" />
        </el-form-item>
        
        <!-- STRING -->
        <el-form-item v-else :label="param.shortName">
          <el-input v-model="formData[param.uuid]" />
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';

interface Props {
  container: BswmdContainer;
  configData?: Record<string, any>;
}

const props = defineProps<Props>();
const emit = defineEmits(['update']);

const parameters = computed(() => props.container.parameters);
const formData = ref<Record<string, any>>(props.configData || {});
</script>
```

#### 文件 12: dem_bswmd.json
```json
{
  "shortName": "Dem",
  "version": "4.2.2",
  "description": "Diagnostic Event Manager",
  "containers": [
    {
      "uuid": "ecuc-dem-configset-def",
      "shortName": "DemConfigSet",
      "description": "Configuration set for DEM",
      "multiplicity": { "lower": 1, "upper": 1 },
      "parameters": [],
      "references": [],
      "subContainers": [
        {
          "uuid": "ecuc-dem-dtc-def",
          "shortName": "DemDTC",
          "description": "Diagnostic Trouble Code configuration",
          "multiplicity": { "lower": 0, "upper": "unbounded" },
          "parameters": [
            {
              "uuid": "ecuc-dem-dtc-value",
              "shortName": "DemDtcValue",
              "description": "DTC value (3 bytes hex)",
              "type": "INTEGER",
              "configClass": "PRE_COMPILE",
              "defaultValue": 0,
              "min": 1,
              "max": 16777215,
              "isOptional": false
            },
            {
              "uuid": "ecuc-dem-dtc-severity",
              "shortName": "DemDTCSeverity",
              "description": "DTC severity",
              "type": "ENUM",
              "configClass": "PRE_COMPILE",
              "defaultValue": "DEM_SEVERITY_NO_SEVERITY",
              "enumValues": [
                "DEM_SEVERITY_NO_SEVERITY",
                "DEM_SEVERITY_CHECK_IMMEDIATELY",
                "DEM_SEVERITY_CHECK_AT_NEXT_HALT",
                "DEM_SEVERITY_MAINTENANCE_ONLY"
              ],
              "isOptional": false
            }
          ],
          "references": [
            {
              "uuid": "ecuc-dem-dtc-attributes-ref",
              "shortName": "DemDTCAttributesRef",
              "description": "Reference to DTC attributes",
              "destinationContainerType": "DemDTCAttributes",
              "isOptional": false
            }
          ],
          "subContainers": []
        }
      ]
    }
  ]
}
```

---

## 4. 验收标准

### 4.1 功能验收
- [ ] BswmdParser 能正确解析 `dem_bswmd.json`
- [ ] BswmdLoader 能从 URL/字符串加载 BSWMD
- [ ] ConfigInstanceManager 能从 BSWMD 创建空配置实例
- [ ] DynamicForm 能根据 BSWMD 渲染正确类型的表单控件
- [ ] ConstraintEngine 能运行约束规则并返回违规列表
- [ ] CGenerator 能生成有效的 C Header 文件
- [ ] 所有 TypeScript 类型正确，无 `any` 滥用

### 4.2 代码质量
- [ ] 通过 `npm run build` 无错误
- [ ] ESLint 无错误（warning 可接受）
- [ ] 所有导出函数有 JSDoc 注释
- [ ] 复杂逻辑有行内注释

### 4.3 测试验证
```typescript
// 示例测试代码（应能运行）
import { BswmdParser } from './BswmdParser';
import { ConfigInstanceManager } from './ConfigInstance';

const parser = new BswmdParser();
const bswmd = parser.parseFromJson(demBswmdJson);
console.assert(bswmd.shortName === 'Dem', 'Module name should be Dem');

const configManager = new ConfigInstanceManager();
const config = configManager.createFromBswmd(bswmd);
console.assert(config.moduleRef === 'Dem', 'Config should reference Dem module');
console.assert(config.containers.length > 0, 'Config should have containers');
```

---

## 5. 约束与红线

### 5.1 禁止事项
- ❌ 使用 `any` 类型（除非绝对必要且有注释）
- ❌ 在核心引擎中引入 Vue 依赖（保持纯 TS）
- ❌ 硬编码模块特定逻辑（保持通用性）

### 5.2 必须遵守
- ✅ BSWMD 解析器必须支持递归嵌套容器
- ✅ 配置实例必须保留对 BSWMD 的引用（definitionRef）
- ✅ UUID 必须使用 `uuid` 库生成
- ✅ 约束引擎必须可扩展（支持动态注册规则）

---

## 6. 参考资源

### 6.1 已有代码
- `src/types/base.ts` - 基础类型
- `src/utils/uuid.ts` - UUID 生成
- `docs/ARCHITECTURE-v2.md` - 架构文档
- `bswmd/dem_bswmd.json` - BSWMD 示例

### 6.2 外部库
- `fast-xml-parser` - ARXML 解析（后续使用）
- `handlebars` - 模板引擎
- `uuid` - UUID 生成

---

## 7. 下一步（Task-003 预览）

Task-003 将基于本任务成果：
- 集成 Vue Flow 实现引用关系图
- 添加 Python 约束运行时（Pyodide）
- 实现 ARXML 导入/导出
- 添加更多 BSW 模块（Dcm, NvM, Can）

---

**开始实现前请确认理解以上需求，如有疑问立即反馈。**
