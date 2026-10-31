import type { BswmdModule, BswmdContainer, BswmdParameter, BswmdReference } from './BswmdTypes';

/**
 * BSWMD 解析器
 * 从 JSON 或 ARXML 格式解析为内存模型
 */
export class BswmdParser {
  /**
   * 从 JSON 字符串解析 BSWMD
   */
  parseFromJson(jsonString: string): BswmdModule {
    try {
      const data = JSON.parse(jsonString) as Record<string, unknown>;
      return this.parseModule(data);
    } catch (error) {
      throw new Error(`Failed to parse BSWMD JSON: ${(error as Error).message}`);
    }
  }

  /**
   * 解析模块根节点
   */
  private parseModule(data: Record<string, unknown>): BswmdModule {
    if (!data.shortName || typeof data.shortName !== 'string') {
      throw new Error('BSWMD module missing required field: shortName');
    }

    return {
      shortName: data.shortName as string,
      version: (data.version as string) || 'unknown',
      description: data.description as string | undefined,
      containers: this.parseContainers(data.containers as unknown[] | undefined)
    };
  }

  /**
   * 解析容器数组
   */
  private parseContainers(containers: unknown[] | undefined): BswmdContainer[] {
    if (!Array.isArray(containers)) {
      return [];
    }

    return containers.map((c, index) => this.parseContainer(c as Record<string, unknown>, index));
  }

  /**
   * 递归解析单个容器
   */
  private parseContainer(data: Record<string, unknown>, index: number): BswmdContainer {
    if (!data.uuid || typeof data.uuid !== 'string') {
      throw new Error(`Container at index ${index} missing required field: uuid`);
    }
    if (!data.shortName || typeof data.shortName !== 'string') {
      throw new Error(`Container missing required field: shortName`);
    }

    return {
      uuid: data.uuid as string,
      shortName: data.shortName as string,
      description: data.description as string | undefined,
      multiplicity: this.parseMultiplicity(data.multiplicity as Record<string, unknown> | undefined),
      parameters: this.parseParameters(data.parameters as unknown[] | undefined),
      references: this.parseReferences(data.references as unknown[] | undefined),
      subContainers: this.parseContainers(data.subContainers as unknown[] | undefined)
    };
  }

  /**
   * 解析多重性定义
   */
  private parseMultiplicity(data: Record<string, unknown> | undefined): { lower: number; upper: number | 'unbounded' } {
    if (!data || typeof data.lower !== 'number') {
      return { lower: 1, upper: 1 }; // 默认值
    }

    return {
      lower: data.lower,
      upper: data.upper === 'unbounded' ? 'unbounded' : (data.upper as number) || 1
    };
  }

  /**
   * 解析参数数组
   */
  private parseParameters(parameters: unknown[] | undefined): BswmdParameter[] {
    if (!Array.isArray(parameters)) {
      return [];
    }

    return parameters.map((p, index) => this.parseParameter(p as Record<string, unknown>, index));
  }

  /**
   * 解析单个参数
   */
  private parseParameter(data: Record<string, unknown>, index: number): BswmdParameter {
    if (!data.uuid || typeof data.uuid !== 'string') {
      throw new Error(`Parameter at index ${index} missing required field: uuid`);
    }
    if (!data.shortName || typeof data.shortName !== 'string') {
      throw new Error(`Parameter missing required field: shortName`);
    }
    if (!data.type || typeof data.type !== 'string') {
      throw new Error(`Parameter ${data.shortName} missing required field: type`);
    }

    return {
      uuid: data.uuid as string,
      shortName: data.shortName as string,
      description: data.description as string | undefined,
      type: data.type as import('./BswmdTypes').EcucParameterType,
      configClass: (data.configClass as import('./BswmdTypes').ConfigClass) || 'PRE_COMPILE',
      defaultValue: data.defaultValue,
      min: data.min as number | undefined,
      max: data.max as number | undefined,
      enumValues: Array.isArray(data.enumValues) ? (data.enumValues as string[]) : undefined,
      isOptional: data.isOptional === true
    };
  }

  /**
   * 解析引用数组
   */
  private parseReferences(references: unknown[] | undefined): BswmdReference[] {
    if (!Array.isArray(references)) {
      return [];
    }

    return references.map((r, index) => this.parseReference(r as Record<string, unknown>, index));
  }

  /**
   * 解析单个引用
   */
  private parseReference(data: Record<string, unknown>, index: number): BswmdReference {
    if (!data.uuid || typeof data.uuid !== 'string') {
      throw new Error(`Reference at index ${index} missing required field: uuid`);
    }
    if (!data.shortName || typeof data.shortName !== 'string') {
      throw new Error(`Reference missing required field: shortName`);
    }

    return {
      uuid: data.uuid as string,
      shortName: data.shortName as string,
      description: data.description as string | undefined,
      destinationContainerType: (data.destinationContainerType as string) || '',
      isOptional: data.isOptional === true
    };
  }
}
