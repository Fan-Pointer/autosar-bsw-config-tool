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
import { indexDefinitions } from './ConfigTraversal';

/**
 * 配置实例管理器
 * 从 BSWMD 创建和管理配置实例
 */
export class ConfigInstanceManager {
  private readonly modules = new Map<string, BswmdModule>();

  /**
   * Supply definitions when editing configurations restored from storage.
   * @param modules Module definitions available to this manager.
   */
  constructor(modules: BswmdModule[] = []) {
    for (const module of modules) this.rememberModule(module);
  }

  private rememberModule(module: BswmdModule): void {
    this.modules.set(JSON.stringify([module.shortName, module.version]), module);
  }

  private getModule(instance: ConfigInstance): BswmdModule {
    const module = this.modules.get(JSON.stringify([instance.moduleRef, instance.version]));
    if (!module) {
      throw new Error(`BSWMD module not loaded: ${instance.moduleRef} (${instance.version})`);
    }
    return module;
  }

  /**
   * 从 BSWMD 创建空配置实例
   * @param bswmd Module definition to instantiate.
   * @returns Editable configuration with definition references and defaults.
   */
  createFromBswmd(bswmd: BswmdModule): ConfigInstance {
    this.rememberModule(bswmd);
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
    // Only the lower bound is mandatory; optional definitions must remain absent until added.
    return definitions.flatMap((definition) =>
      Array.from({ length: definition.multiplicity.lower }, (_, index) => {
        const container = this.createContainerFromBswmd(definition);
        if (index > 0) container.shortName += `_${index + 1}`;
        return container;
      })
    );
  }

  /**
   * Add a container and its required descendants without exceeding the sibling upper bound.
   * @param instance Configuration created here, or restored using constructor-supplied definitions.
   * @param parentContainerUuid Parent instance UUID, or null to add a root container.
   * @param definitionUuid UUID of a definition directly allowed under that parent.
   * @returns The newly inserted container, with defaults and fresh instance UUIDs.
   */
  addContainerInstance(
    instance: ConfigInstance,
    parentContainerUuid: string | null,
    definitionUuid: string
  ): ConfigContainer {
    const module = this.getModule(instance);
    const parent =
      parentContainerUuid === null ? null : this.findContainer(instance, parentContainerUuid);
    if (parentContainerUuid !== null && !parent) {
      throw new Error(`Parent container not found: ${parentContainerUuid}`);
    }
    const definitions = parent
      ? indexDefinitions(module).get(parent.definitionRef)?.subContainers
      : module.containers;
    const definition = definitions?.find((item) => item.uuid === definitionUuid);
    if (!definition) {
      throw new Error(
        `Definition ${definitionUuid} is not allowed under ${parentContainerUuid ?? 'module root'}`
      );
    }
    const siblings = parent ? parent.subContainers : instance.containers;
    const count = siblings.filter((item) => item.definitionRef === definitionUuid).length;
    if (definition.multiplicity.upper !== 'unbounded' && count >= definition.multiplicity.upper) {
      throw new Error(
        `${definition.shortName}: upper multiplicity ${definition.multiplicity.upper} reached`
      );
    }
    const container = this.createContainerFromBswmd(definition);
    const names = new Set(siblings.map((item) => item.shortName));
    // Count alone is insufficient after deletion: reusing it could duplicate a remaining name.
    for (let suffix = 2; names.has(container.shortName); suffix++) {
      container.shortName = `${definition.shortName}_${suffix}`;
    }
    siblings.push(container);
    this.touch(instance);
    return container;
  }

  /**
   * Remove a container subtree without violating its sibling lower bound.
   * References from remaining containers are retained for validation to report dangling targets.
   * @param instance Configuration with definitions available to this manager.
   * @param containerUuid UUID of the container to remove.
   * @returns The removed container subtree; throws when missing or required by multiplicity.
   */
  removeContainerInstance(instance: ConfigInstance, containerUuid: string): ConfigContainer {
    const module = this.getModule(instance);
    const siblings = this.findContainerSiblings(instance.containers, containerUuid);
    const container = siblings?.find((item) => item.uuid === containerUuid);
    if (!siblings || !container) throw new Error(`Container not found: ${containerUuid}`);
    const definition = indexDefinitions(module).get(container.definitionRef);
    if (!definition) throw new Error(`Unknown definitionRef: ${container.definitionRef}`);
    const count = siblings.filter((item) => item.definitionRef === container.definitionRef).length;
    if (count <= definition.multiplicity.lower) {
      throw new Error(
        `${definition.shortName}: lower multiplicity ${definition.multiplicity.lower} required`
      );
    }
    siblings.splice(siblings.indexOf(container), 1);
    this.touch(instance);
    return container;
  }

  private findContainerSiblings(
    containers: ConfigContainer[],
    uuid: string
  ): ConfigContainer[] | null {
    if (containers.some((item) => item.uuid === uuid)) return containers;
    // Return the actual containing array so a nested removal mutates only that parent's children.
    for (const container of containers) {
      const siblings = this.findContainerSiblings(container.subContainers, uuid);
      if (siblings) return siblings;
    }
    return null;
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
