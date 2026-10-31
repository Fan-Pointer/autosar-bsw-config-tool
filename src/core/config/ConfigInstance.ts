import type {
  ConfigInstance,
  ConfigContainer,
  ConfigParameterValue,
  ConfigReferenceValue,
} from './ConfigTypes';
import type {
  BswmdModule,
  BswmdContainer,
  BswmdParameter,
  BswmdReference,
} from '@/core/bswmd/BswmdTypes';
import { generateUUID } from '@/utils/uuid';

/**
 * 配置实例管理器
 * 从 BSWMD 创建和管理配置实例
 */
export class ConfigInstanceManager {
  /**
   * 从 BSWMD 创建空配置实例
   * @param bswmd Module definition to instantiate.
   * @returns Editable configuration with definition references and defaults.
   */
  createFromBswmd(bswmd: BswmdModule): ConfigInstance {
    const now = Date.now();

    return {
      uuid: generateUUID(),
      moduleRef: bswmd.shortName,
      version: bswmd.version,
      containers: this.createContainers(bswmd.containers),
      createdAt: now,
      lastModified: now,
    };
  }

  private createContainers(definitions: BswmdContainer[]): ConfigContainer[] {
    // TASK-002 requires a starter instance for every definition, including optional containers.
    return definitions.flatMap((definition) =>
      Array.from(
        {
          length:
            definition.multiplicity.upper === 0 ? 0 : Math.max(1, definition.multiplicity.lower),
        },
        (_, index) => {
          const container = this.createContainerFromBswmd(definition);
          if (index > 0) container.shortName += `_${index + 1}`;
          return container;
        }
      )
    );
  }

  /**
   * 递归创建容器实例
   */
  private createContainerFromBswmd(bswmdContainer: BswmdContainer): ConfigContainer {
    return {
      uuid: generateUUID(),
      definitionRef: bswmdContainer.uuid,
      shortName: bswmdContainer.shortName,
      description: bswmdContainer.description,
      parameters: this.createParametersFromBswmd(bswmdContainer.parameters),
      references: this.createReferencesFromBswmd(bswmdContainer.references),
      subContainers: this.createContainers(bswmdContainer.subContainers),
    };
  }

  /**
   * 从 BSWMD 参数定义创建参数值 Map
   */
  private createParametersFromBswmd(
    parameters: BswmdParameter[]
  ): Map<string, ConfigParameterValue> {
    const map = new Map<string, ConfigParameterValue>();

    for (const param of parameters) {
      const value: ConfigParameterValue = {
        definitionRef: param.uuid,
        value: this.getDefaultValue(param),
        isConfigured: false,
      };
      map.set(param.uuid, value);
    }

    return map;
  }

  /**
   * 从 BSWMD 引用定义创建引用值 Map
   */
  private createReferencesFromBswmd(
    references: BswmdReference[]
  ): Map<string, ConfigReferenceValue> {
    const map = new Map<string, ConfigReferenceValue>();

    for (const ref of references) {
      const value: ConfigReferenceValue = {
        definitionRef: ref.uuid,
        targetUuid: '', // 初始为空，需用户后续设置
      };
      map.set(ref.uuid, value);
    }

    return map;
  }

  /**
   * 获取参数的默认值
   */
  private getDefaultValue(param: BswmdParameter): unknown {
    if (param.defaultValue !== undefined) {
      return param.defaultValue;
    }

    // 根据类型返回合适的默认值
    switch (param.type) {
      case 'BOOLEAN':
        return false;
      case 'INTEGER':
        return param.min ?? 0;
      case 'FLOAT':
        return param.min ?? 0.0;
      case 'STRING':
        return '';
      case 'ENUM':
        return param.enumValues?.[0] ?? '';
      case 'FUNCTION':
        return '';
      case 'REFERENCE':
        return '';
      default:
        return null;
    }
  }

  /**
   * 递归查找容器（按 UUID）
   * @param instance Configuration to search.
   * @param uuid Instance UUID.
   * @returns Matching container, or null.
   */
  findContainer(instance: ConfigInstance, uuid: string): ConfigContainer | null {
    for (const container of instance.containers) {
      const found = this.findContainerRecursive(container, uuid);
      if (found) return found;
    }
    return null;
  }

  /**
   * 递归查找容器
   */
  private findContainerRecursive(container: ConfigContainer, uuid: string): ConfigContainer | null {
    if (container.uuid === uuid) {
      return container;
    }

    for (const sub of container.subContainers) {
      const found = this.findContainerRecursive(sub, uuid);
      if (found) return found;
    }

    return null;
  }

  /**
   * 设置参数值
   * @param container Container to edit.
   * @param paramDefUuid Parameter definition UUID.
   * @param value New parameter value.
   * @returns Nothing; marks the parameter configured.
   */
  setParameterValue(container: ConfigContainer, paramDefUuid: string, value: unknown): void {
    const param = container.parameters.get(paramDefUuid);
    if (!param) {
      throw new Error(
        `Parameter with definitionRef ${paramDefUuid} not found in container ${container.shortName}`
      );
    }

    param.value = value;
    param.isConfigured = true;
  }

  /**
   * 设置引用目标
   * @param container Container to edit.
   * @param refDefUuid Reference definition UUID.
   * @param targetUuid Target instance UUID, or an empty string to clear it.
   * @returns Nothing; updates the reference in place.
   */
  setReferenceTarget(container: ConfigContainer, refDefUuid: string, targetUuid: string): void {
    const ref = container.references.get(refDefUuid);
    if (!ref) {
      throw new Error(
        `Reference with definitionRef ${refDefUuid} not found in container ${container.shortName}`
      );
    }

    ref.targetUuid = targetUuid;
  }

  /**
   * 更新最后修改时间
   * @param instance Modified configuration.
   * @returns Nothing; refreshes its timestamp.
   */
  touch(instance: ConfigInstance): void {
    instance.lastModified = Date.now();
  }
}
