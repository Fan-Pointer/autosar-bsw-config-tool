/**
 * 模板引擎 - 基于 Handlebars
 */

// 动态导入 Handlebars，避免 SSR 问题
let Handlebars: any = null;

async function getHandlebars() {
  if (!Handlebars) {
    try {
      Handlebars = await import('handlebars');
    } catch (error) {
      throw new Error('Handlebars not installed. Run: npm install handlebars');
    }
  }
  return Handlebars;
}

/**
 * 代码模板定义
 */
export interface CodeTemplate {
  /** 模板唯一名称 */
  name: string;
  /** 输出文件名模式，如 "{module}_Cfg.h" */
  filePattern: string;
  /** 模板内容 */
  content: string;
  /** 输出目录（相对路径） */
  outputDir?: string;
}

/**
 * 生成的文件
 */
export interface GeneratedFile {
  /** 文件名 */
  filename: string;
  /** 文件内容 */
  content: string;
  /** 相对路径 */
  path: string;
}

export class TemplateEngine {
  private templates = new Map<string, string>();

  /**
   * 注册模板
   */
  registerTemplate(template: CodeTemplate): void {
    this.templates.set(template.name, template.content);
  }

  /**
   * 批量注册模板
   */
  registerTemplates(templates: CodeTemplate[]): void {
    for (const template of templates) {
      this.registerTemplate(template);
    }
  }

  /**
   * 生成文件
   */
  async generate(templateName: string, data: Record<string, unknown>): Promise<GeneratedFile> {
    const templateContent = this.templates.get(templateName);
    if (!templateContent) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const Handlebars = await getHandlebars();
    const compiled = Handlebars.compile(templateContent);
    const content = compiled(data);

    return {
      filename: data.filePattern as string || `output_${templateName}`,
      content,
      path: data.outputPath as string || '/'
    };
  }
}
