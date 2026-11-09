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
import { cloneContainers } from './ConfigClone';
import { createParameterValue } from './ConfigValues';

/** An allowed child definition and the core-owned reason it cannot currently be added. */
export interface ContainerAddOption {
  definition: BswmdContainer;
  disabledReason?: string;
}

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
    const { definition, siblings } = this.addContext(instance, parentContainerUuid, definitionUuid);
    const container = this.createContainerFromBswmd(definition);
    container.shortName = this.uniqueName(definition.shortName, siblings);
    siblings.push(container);
    this.touch(instance);
    return container;
  }

  private childContext(instance: ConfigInstance, parentContainerUuid: string | null) {
    const module = this.getModule(instance);
    const parent =
      parentContainerUuid === null ? null : this.findContainer(instance, parentContainerUuid);
    if (parentContainerUuid !== null && !parent) {
      throw new Error(`Parent container not found: ${parentContainerUuid}`);
    }
    const parentDefinition = parent
      ? indexDefinitions(module).get(parent.definitionRef)
      : undefined;
    const definitions = parent ? parentDefinition?.subContainers : module.containers;
    return {
      parentDefinition,
      definitions: definitions ?? [],
      siblings: parent ? parent.subContainers : instance.containers,
    };
  }

  private upperReason(definition: BswmdContainer, siblings: ConfigContainer[]): string | undefined {
    const count = siblings.filter((item) => item.definitionRef === definition.uuid).length;
    return definition.multiplicity.upper !== 'unbounded' && count >= definition.multiplicity.upper
      ? `${definition.shortName}: upper multiplicity ${definition.multiplicity.upper} reached`
      : undefined;
  }

  private addContext(
    instance: ConfigInstance,
    parentContainerUuid: string | null,
    definitionUuid: string
  ) {
    const { definitions, siblings, parentDefinition } = this.childContext(
      instance,
      parentContainerUuid
    );
    const definition = definitions.find((item) => item.uuid === definitionUuid);
    if (!definition) {
      throw new Error(
        `Definition ${definitionUuid} is not allowed under ${parentContainerUuid ?? 'module root'}`
      );
    }
    if (parentDefinition?.choice && siblings.length)
      throw new Error('CHOICE 只能选择一个候选，请使用切换候选操作');
    const reason = this.upperReason(definition, siblings);
    if (reason) throw new Error(reason);
    return { definition, siblings };
  }

  private uniqueName(base: string, siblings: ConfigContainer[]): string {
    const names = new Set(siblings.map((item) => item.shortName));
    let name = base;
    // Count alone is insufficient after deletion: reusing it could duplicate a remaining name.
    for (let suffix = 2; names.has(name); suffix++) {
      name = `${base}_${suffix}`;
    }
    return name;
  }

  /**
   * Query child choices using the same bounds enforced by addContainerInstance.
   * @param instance Configuration with loaded definitions.
   * @param parentUuid Parent UUID, or null for module roots.
   * @returns Direct child definitions with disabled reasons.
   */
  getAddOptions(instance: ConfigInstance, parentUuid: string | null): ContainerAddOption[] {
    const { definitions, siblings, parentDefinition } = this.childContext(instance, parentUuid);
    return definitions.map((definition) => ({
      definition,
      disabledReason:
        parentDefinition?.choice && siblings.length
          ? 'CHOICE 只能选择一个候选，请使用切换候选操作'
          : this.upperReason(definition, siblings),
    }));
  }

  /**
   * Remove a container subtree without violating its sibling lower bound.
   * References from remaining containers are retained for validation to report dangling targets.
   * @param instance Configuration with definitions available to this manager.
   * @param containerUuid UUID of the container to remove.
   * @returns The removed container subtree; throws when missing or required by multiplicity.
   */
  removeContainerInstance(instance: ConfigInstance, containerUuid: string): ConfigContainer {
    const { siblings, container } = this.removalContext(instance, containerUuid);
    siblings.splice(siblings.indexOf(container), 1);
    this.touch(instance);
    return container;
  }

  private removalContext(instance: ConfigInstance, containerUuid: string) {
    const module = this.getModule(instance);
    const siblings = this.findContainerSiblings(instance.containers, containerUuid);
    const container = siblings?.find((item) => item.uuid === containerUuid);
    if (!siblings || !container) throw new Error(`Container not found: ${containerUuid}`);
    const definition = indexDefinitions(module).get(container.definitionRef);
    if (!definition) throw new Error(`Unknown definitionRef: ${container.definitionRef}`);
    const parent = this.findParent(instance, containerUuid);
    if (parent && indexDefinitions(module).get(parent.definitionRef)?.choice)
      throw new Error('CHOICE 候选不可单独删除，请切换候选或删除可选分组');
    const count = siblings.filter((item) => item.definitionRef === container.definitionRef).length;
    if (count <= definition.multiplicity.lower) {
      throw new Error(
        `${definition.shortName}: lower multiplicity ${definition.multiplicity.lower} required`
      );
    }
    return { siblings, container };
  }

  /**
   * Query removal availability without mutating the instance.
   * @param instance Configuration with loaded definitions.
   * @param containerUuid Instance to remove.
   * @returns Core validation reason, or undefined when removal is permitted.
   */
  getRemovalReason(instance: ConfigInstance, containerUuid: string): string | undefined {
    try {
      this.removalContext(instance, containerUuid);
      return undefined;
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }

  /**
   * Find the parent used for insertion and selection fallback.
   * @param instance Configuration to traverse.
   * @param containerUuid Existing container UUID.
   * @returns Parent container, or null for a root; throws if the UUID is absent.
   */
  findParent(instance: ConfigInstance, containerUuid: string): ConfigContainer | null {
    const visit = (
      children: ConfigContainer[],
      parent: ConfigContainer | null
    ): ConfigContainer | null | undefined => {
      for (const child of children) {
        if (child.uuid === containerUuid) return parent;
        const found = visit(child.subContainers, child);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    const parent = visit(instance.containers, null);
    if (parent === undefined) throw new Error(`Container not found: ${containerUuid}`);
    return parent;
  }

  /**
   * Clone a subtree under its existing parent, enforcing the ordinary insertion limit.
   * @param instance Configuration to edit.
   * @param containerUuid Subtree root to clone.
   * @returns New subtree; internal targets are remapped and external targets are cleared.
   */
  cloneContainerInstance(instance: ConfigInstance, containerUuid: string): ConfigContainer {
    const parent = this.findParent(instance, containerUuid);
    const source = this.findContainer(instance, containerUuid)!;
    const { siblings } = this.addContext(instance, parent?.uuid ?? null, source.definitionRef);
    const clone = cloneContainers([source])[0];
    clone.shortName = this.uniqueName(source.shortName, siblings);
    // Insertion still goes through the public lifecycle API, so clone cannot bypass multiplicity.
    const inserted = this.addContainerInstance(
      instance,
      parent?.uuid ?? null,
      source.definitionRef
    );
    Object.assign(inserted, clone);
    return inserted;
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
      // Candidate lower bounds do not authorize choosing every alternative on the user's behalf.
      subContainers: bswmdContainer.choice
        ? []
        : this.createContainers(bswmdContainer.subContainers),
    };
  }

  /** Replace a choice's selected subtree after the caller confirms data loss.
   * @param instance Configuration with loaded definitions.
   * @param groupUuid Choice group instance UUID.
   * @param candidateRef Candidate definition UUID.
   * @returns Selected subtree; the caller records the whole replacement as one undo operation.
   */
  selectChoice(instance: ConfigInstance, groupUuid: string, candidateRef: string): ConfigContainer {
    const group = this.findContainer(instance, groupUuid);
    const definition = group && indexDefinitions(this.getModule(instance)).get(group.definitionRef);
    if (!group || !definition?.choice?.candidateRefs.includes(candidateRef))
      throw new Error('CHOICE 分组或候选定义无效');
    const candidate = definition.subContainers.find((child) => child.uuid === candidateRef)!;
    if (candidate.multiplicity.upper === 0) throw new Error('CHOICE 候选实例上限为 0');
    if (group.subContainers.length === 1 && group.subContainers[0].definitionRef === candidateRef)
      return group.subContainers[0];
    // Construct before replacing, so a failed creation leaves the previous configuration intact.
    const selected = this.createContainerFromBswmd(candidate);
    group.subContainers = [selected];
    this.touch(instance);
    return selected;
  }

  /**
   * 从 BSWMD 参数定义创建参数值 Map
   */
  private createParametersFromBswmd(
    parameters: BswmdParameter[]
  ): Map<string, ConfigParameterValue> {
    const map = new Map<string, ConfigParameterValue>();

    for (const param of parameters) {
      map.set(param.uuid, createParameterValue(param));
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
        isConfigured: false,
      };
      map.set(ref.uuid, value);
    }

    return map;
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
   * @param value New parameter value. For a multi-value parameter this must be the full row array.
   * @returns Nothing; marks the parameter configured.
   */
  setParameterValue(container: ConfigContainer, paramDefUuid: string, value: unknown): void {
    const param = container.parameters.get(paramDefUuid);
    if (!param) {
      throw new Error(
        `Parameter with definitionRef ${paramDefUuid} not found in container ${container.shortName}`
      );
    }

    if (Array.isArray(value)) {
      // G32: a multi-value parameter stores its rows as the value array itself.
      param.value = [...value];
      param.isConfigured = value.length > 0;
      return;
    }
    param.value = value;
    param.isConfigured = true;
  }

  /**
   * 追加一行多值参数值（G32）。上限由调用方按定义 multiplicity 预先校验。
   * @param container Container to edit. @param paramDefUuid Multi-value parameter definition UUID.
   * @param value Row value. @returns The new row count.
   */
  addParameterValueRow(
    container: ConfigContainer,
    paramDefUuid: string,
    value: unknown,
    upper?: number | 'unbounded'
  ): number {
    const param = this.parameterFor(container, paramDefUuid);
    const rows = Array.isArray(param.value) ? param.value : [];
    if (typeof upper === 'number' && rows.length >= upper)
      throw new Error(`upper multiplicity ${upper} reached`);
    const next = [...rows, value];
    param.value = next;
    param.isConfigured = next.length > 0;
    return next.length;
  }

  /**
   * 删除一行多值参数值（G32）。
   * @param container Container to edit. @param paramDefUuid Multi-value parameter definition UUID.
   * @param index Row index. @returns The remaining row count; throws when the row is missing.
   */
  removeParameterValueRow(
    container: ConfigContainer,
    paramDefUuid: string,
    index: number
  ): number {
    const param = this.parameterFor(container, paramDefUuid);
    const rows = Array.isArray(param.value) ? param.value : [];
    if (index < 0 || index >= rows.length)
      throw new Error(`行序号越界：${index}（共 ${rows.length} 行）`);
    const remaining = rows.filter((_, i) => i !== index);
    param.value = remaining.length ? remaining : undefined;
    param.isConfigured = remaining.length > 0;
    return remaining.length;
  }

  /**
   * 编辑一行多值参数值（G32）。
   * @param container Container to edit. @param paramDefUuid Multi-value parameter definition UUID.
   * @param index Row index. @param value New row value. @returns Nothing.
   */
  setParameterValueRow(
    container: ConfigContainer,
    paramDefUuid: string,
    index: number,
    value: unknown
  ): void {
    const param = this.parameterFor(container, paramDefUuid);
    const rows = Array.isArray(param.value) ? param.value : [];
    if (index < 0 || index >= rows.length)
      throw new Error(`行序号越界：${index}（共 ${rows.length} 行）`);
    param.value = rows.map((row, i) => (i === index ? value : row));
    param.isConfigured = true;
  }

  private parameterFor(container: ConfigContainer, paramDefUuid: string): ConfigParameterValue {
    const param = container.parameters.get(paramDefUuid);
    if (!param)
      throw new Error(
        `Parameter with definitionRef ${paramDefUuid} not found in container ${container.shortName}`
      );
    return param;
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
    ref.isConfigured = targetUuid !== '';
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
