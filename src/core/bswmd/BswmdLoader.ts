import type { BswmdModule } from './BswmdTypes';
import { BswmdParser } from './BswmdParser';

/**
 * BSWMD 加载器
 * 管理 BSWMD 文件的加载和缓存
 */
export class BswmdLoader {
  private parser = new BswmdParser();
  private loadedModules = new Map<string, BswmdModule>();

  /**
   * 从 URL 加载 BSWMD（使用 fetch）
   * @param url Definition URL; only retrieves definitions, never sends configuration.
   * @returns Parsed and cached module.
   */
  async loadFromUrl(url: string): Promise<BswmdModule> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.text();
      const module = this.parser.parseFromJson(json);
      this.cacheModule(module);
      return module;
    } catch (error) {
      throw new Error(
        `Failed to load BSWMD from URL ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 从 JSON 字符串加载
   * @param jsonString Serialized definition.
   * @returns Parsed and cached module.
   */
  loadFromString(jsonString: string): BswmdModule {
    try {
      const module = this.parser.parseFromJson(jsonString);
      this.cacheModule(module);
      return module;
    } catch (error) {
      throw new Error(
        `Failed to load BSWMD from string: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 从 File 对象加载（浏览器文件选择）
   * @param file Locally selected definition file.
   * @returns Parsed and cached module.
   */
  async loadFromFile(file: File): Promise<BswmdModule> {
    try {
      const text = await file.text();
      const module = this.parser.parseFromJson(text);
      this.cacheModule(module);
      return module;
    } catch (error) {
      throw new Error(
        `Failed to load BSWMD from file ${file.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取已加载的模块
   * @param name Module short name.
   * @returns Cached module, if present.
   */
  getModule(name: string): BswmdModule | undefined {
    return this.loadedModules.get(name);
  }

  /**
   * 列出所有已加载模块的名称
   * @returns Cached short names.
   */
  listModules(): string[] {
    return Array.from(this.loadedModules.keys());
  }

  /**
   * 获取所有已加载模块
   * @returns Cached module definitions.
   */
  getAllModules(): BswmdModule[] {
    return Array.from(this.loadedModules.values());
  }

  /**
   * 清除缓存
   * @returns Nothing.
   */
  clearCache(): void {
    this.loadedModules.clear();
  }

  /**
   * 缓存模块
   */
  private cacheModule(module: BswmdModule): void {
    this.loadedModules.set(module.shortName, module);
  }
}
