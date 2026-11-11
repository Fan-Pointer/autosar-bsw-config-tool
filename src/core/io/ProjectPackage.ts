import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import type { ConfigInstance } from '@/core/config/ConfigTypes';
import { CGenerator } from '@/core/generator/CGenerator';
import { exportArxml, exportProjectArxml, prettyXml } from './Arxml';
import { buildZip, type ZipEntry } from './Zip';

/** 工程包输入（G44 / FR-28）：工程元数据 + 该工程的配置集与定义。 */
export interface ProjectPackageInput {
  projectName: string;
  autosarVersion: string;
  chip: string;
  entries: { config: ConfigInstance; module: BswmdModule }[];
}

export interface ProjectPackageManifest {
  name: string;
  autosarVersion: string;
  chip: string;
  generatedAt: string;
  modules: { module: string; arxml: string; code?: { header: string; source: string } }[];
  skipped: { module: string; reason: string }[];
}

/**
 * 生成工程包 zip：工程 ARXML（多模块合一）+ 每模块 ARXML + 每模块 C 代码 + manifest。
 * 单个模块 C 生成失败不阻断整包（记入 manifest.skipped），工程 ARXML 失败则整体拒绝。
 * @param input 工程元数据与配置集。
 * @returns zip 字节流与清单（清单同时写入包内 manifest.json）。
 */
export async function buildProjectPackage(
  input: ProjectPackageInput
): Promise<{ zip: Uint8Array; manifest: ProjectPackageManifest }> {
  if (!input.entries.length) throw new Error('工程内没有可导出的配置集');
  const files: ZipEntry[] = [];
  const manifest: ProjectPackageManifest = {
    name: input.projectName,
    autosarVersion: input.autosarVersion,
    chip: input.chip,
    generatedAt: new Date().toISOString(),
    modules: [],
    skipped: [],
  };

  // 工程级 ARXML 必须先全部通过输出闸门，否则整包不生成（避免半成品交付）。
  files.push({ path: 'project.arxml', content: exportProjectArxml(input.entries) });

  const generator = new CGenerator();
  for (const { config, module } of input.entries) {
    const moduleArxmlPath = `modules/${module.shortName}.arxml`;
    files.push({ path: moduleArxmlPath, content: exportArxml(config, module) });
    const record: ProjectPackageManifest['modules'][number] = {
      module: module.shortName,
      arxml: moduleArxmlPath,
    };
    try {
      const header = await generator.generateHeader(config, module);
      const source = await generator.generateSource(config, module);
      const headerPath = `code/${module.shortName}_Cfg.h`;
      const sourcePath = `code/${module.shortName}_Cfg.c`;
      files.push({ path: headerPath, content: header.content });
      files.push({ path: sourcePath, content: source.content });
      record.code = { header: headerPath, source: sourcePath };
    } catch (reason) {
      manifest.skipped.push({
        module: module.shortName,
        reason: reason instanceof Error ? reason.message.split('\n')[0] : String(reason),
      });
    }
    manifest.modules.push(record);
  }

  files.push({ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) });
  return { zip: buildZip(files), manifest };
}

/**
 * 模块 ARXML 压缩包：每个模块一个独立 ARXML 文件（G46 用户裁定）。
 * 校验未通过的模块跳过并在清单里说明，不阻断其余模块导出。
 * @param input 工程元数据与配置集。
 * @returns zip 内容与逐模块结果。
 */
export function buildModuleArxmlZip(input: ProjectPackageInput): {
  zip: Uint8Array;
  exported: string[];
  skipped: { module: string; reason: string }[];
} {
  const files: ZipEntry[] = [];
  const exported: string[] = [];
  const skipped: { module: string; reason: string }[] = [];
  for (const { config, module } of input.entries) {
    try {
      files.push({
        path: `${module.shortName}.arxml`,
        content: prettyXml(exportArxml(config, module)),
      });
      exported.push(module.shortName);
    } catch (reason) {
      skipped.push({
        module: module.shortName,
        reason: reason instanceof Error ? reason.message.split('\n')[0] : String(reason),
      });
    }
  }
  files.push({
    path: 'manifest.json',
    content: JSON.stringify(
      {
        name: input.projectName,
        autosarVersion: input.autosarVersion,
        chip: input.chip,
        generatedAt: new Date().toISOString(),
        modules: exported,
        skipped,
      },
      null,
      2
    ),
  });
  return { zip: buildZip(files), exported, skipped };
}
