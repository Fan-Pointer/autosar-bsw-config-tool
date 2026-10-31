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
      throw new Error(`Failed to load BSWMD from URL: ${(error as Error).message}`);
    }
  }

  /**
   * 从 JSON 字符串加载
   */
  loadFromString(jsonString: string): BswmdModule {
    try {
      const module = this.parser.parseFromJson(jsonString);
      this.cacheModule(module);
      return module;
    } catch (error) {
      throw new Error(`Failed to load BSWMD from string: ${(error as Error).message}`);
    }
  }

  /**
   * 从 File 对象加载（浏览器文件选择）
   */
  async loadFromFile(file: File): Promise<BswmdModule> {
    try {
      const text = await file.text();
      const module = this.parser.parseFromJson(text);
      this.cacheModule(module);
      return module;
    } catch (error) {
      throw new Error(`Failed to load BSWMD from file: ${(error as Error).message}`);
    }
  }

  /**
   * 获取已加载的模块
   */
  getModule(name: string): BswmdModule | undefined {
    return this.loadedModules.get(name);
  }

  /**
   * 列出所有已加载模块的名称
   */
  listModules(): string[] {
    return Array.from(this.loadedModules.keys());
  }

  /**
   * 获取所有已加载模块
   */
  getAllModules(): BswmdModule[] {
    return Array.from(this.loadedModules.values());
  }

  /**
   * 清除缓存
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
