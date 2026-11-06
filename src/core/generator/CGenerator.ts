import type { ConfigInstance } from '../config/ConfigTypes';
import type { BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { TemplateEngine, type GeneratedFile } from './TemplateEngine';
import {
  assertOutputReady,
  evaluateOutputReadiness,
  type OutputCheckResult,
} from '../output/OutputGate';

interface GeneratedField {
  name: string;
  cType: string;
  value: string;
}

interface GeneratedContainer {
  name: string;
  childCount: number;
  fields: GeneratedField[];
}

function identifier(value: string): string {
  const ascii = Array.from(value)
    .map((char) => (/[A-Za-z0-9]/.test(char) ? char : `_U${char.codePointAt(0)?.toString(16)}_`))
    .join('');
  return /^[A-Za-z]/.test(ascii) ? ascii : `CFG${ascii}`;
}

function cString(value: string): string {
  // Fixed-width octal escapes cannot consume the following digit as a hex escape would.
  const escaped = Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (char === '"' || char === '\\') return `\\${char}`;
      if (code < 32 || code === 127 || char === '?')
        return `\\${code.toString(8).padStart(3, '0')}`;
      return char;
    })
    .join('');
  return `"${escaped}"`;
}

/** Generate standalone C configuration data from arbitrary module definitions. */
export class CGenerator {
  private templateEngine = new TemplateEngine();

  /** Register the module-independent templates. */
  constructor() {
    this.templateEngine.registerTemplates([
      {
        name: 'c-header',
        filePattern: '{module}_Cfg.h',
        content: `/* Generated configuration: {{module}}
 * Generic configuration data only; this is not a supplier BSW ABI.
 * The integrating application must adapt these constants and initialize its BSW.
 * Only explicitly configured values are included; omitted fields have no implied value.
 */
#ifndef {{moduleUpper}}_CFG_H
#define {{moduleUpper}}_CFG_H

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif

#define {{moduleUpper}}_CFG_CONTAINER_COUNT {{containerCount}}
{{#each containers}}
#define {{name}}_CHILD_COUNT {{childCount}}
{{#each fields}}
#define {{../name}}_{{name}} {{value}}
{{/each}}
{{/each}}
#endif /* {{moduleUpper}}_CFG_H */
`,
      },
      {
        name: 'c-source',
        filePattern: '{module}_PBCfg.c',
        content: `/* Generated configuration data: {{module}}
 * Generic data constants, not a supplier BSW implementation or initialization routine.
 * The integrating application owns adaptation and BSW initialization.
 */
#include "{{module}}_Cfg.h"

{{#each containers}}
{{#if fields.length}}
const struct {
{{#each fields}}
  {{cType}} {{name}};
{{/each}}
} {{name}}_CONFIG = {
{{#each fields}}
  .{{name}} = {{value}},
{{/each}}
};
{{/if}}
{{/each}}
`,
      },
    ]);
  }

  /**
   * Retained for callers that initialize the generator explicitly.
   * @returns A resolved initialization promise.
   */
  async init(): Promise<void> {}

  /**
   * Generate the module header with unique ASCII macro names.
   * @param config Configuration values.
   * @param bswmd Module definition.
   * @param outputCheck Optional fresh result from this same generation action.
   * @returns The generated module_Cfg.h file.
   */
  async generateHeader(
    config: ConfigInstance,
    bswmd: BswmdModule,
    outputCheck?: OutputCheckResult
  ): Promise<GeneratedFile> {
    assertOutputReady(outputCheck ?? evaluateOutputReadiness(config, bswmd));
    return this.templateEngine.generate('c-header', this.context(config, bswmd));
  }

  /**
   * Generate typed configuration constants, including post-build values.
   * @param config Configuration values.
   * @param bswmd Module definition.
   * @param outputCheck Optional fresh result from this same generation action.
   * @returns The generated module_PBCfg.c file.
   */
  async generateSource(
    config: ConfigInstance,
    bswmd: BswmdModule,
    outputCheck?: OutputCheckResult
  ): Promise<GeneratedFile> {
    assertOutputReady(outputCheck ?? evaluateOutputReadiness(config, bswmd));
    return this.templateEngine.generate('c-source', this.context(config, bswmd));
  }

  private context(config: ConfigInstance, bswmd: BswmdModule): Record<string, unknown> {
    if (config.moduleRef !== bswmd.shortName)
      throw new Error('Configuration moduleRef does not match BSWMD');
    const module = identifier(bswmd.shortName);
    const entries = collectContainers(config, bswmd);
    const targets = new Map(entries.map((entry, index) => [entry.container.uuid, index]));
    const containers: GeneratedContainer[] = entries.map((entry, index) => {
      const fields: GeneratedField[] = entry.definition.parameters.flatMap(
        (parameter, fieldIndex) => {
          const configured = entry.container.parameters.get(parameter.uuid);
          if (!configured?.isConfigured || configured.value === undefined) return [];
          return [
            {
              name: `P${fieldIndex}_${identifier(parameter.shortName).toUpperCase()}`,
              cType:
                parameter.type === 'BOOLEAN'
                  ? 'int'
                  : parameter.type === 'INTEGER'
                    ? 'long long'
                    : parameter.type === 'FLOAT'
                      ? 'double'
                      : 'const char *',
              value: this.formatValue(configured.value, parameter),
            },
          ];
        }
      );
      entry.definition.references.forEach((reference, referenceIndex) => {
        const configured = entry.container.references.get(reference.uuid);
        if (!configured?.isConfigured || !configured.targetUuid) return;
        const target = configured.targetUuid;
        fields.push({
          name: `R${referenceIndex}_${identifier(reference.shortName).toUpperCase()}`,
          cType: 'long long',
          value: String(targets.get(target)),
        });
      });
      // Ordinals disambiguate duplicate instance names and names that differ only in case.
      return {
        name: `${module.toUpperCase()}_C${index}_${identifier(entry.container.shortName).toUpperCase()}`,
        childCount: entry.container.subContainers.length,
        fields,
      };
    });
    return {
      module,
      moduleUpper: module.toUpperCase(),
      containerCount: containers.length,
      containers,
    };
  }

  private formatValue(value: unknown, parameter: BswmdParameter): string {
    const actual = value;
    if (parameter.type === 'BOOLEAN' && typeof actual === 'boolean')
      return actual ? 'TRUE' : 'FALSE';
    if (parameter.type === 'INTEGER' && typeof actual === 'number' && Number.isSafeInteger(actual))
      return String(actual);
    if (parameter.type === 'FLOAT' && typeof actual === 'number' && Number.isFinite(actual))
      return String(actual);
    if (!['BOOLEAN', 'INTEGER', 'FLOAT'].includes(parameter.type) && typeof actual === 'string')
      return cString(actual);
    throw new Error(`${parameter.shortName}: invalid ${parameter.type} value for C generation`);
  }
}
