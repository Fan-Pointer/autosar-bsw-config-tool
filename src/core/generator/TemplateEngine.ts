import Handlebars from 'handlebars';

/** A named source template and its output location. */
export interface CodeTemplate {
  name: string;
  /** Supports {module} placeholders in filenames. */
  filePattern: string;
  content: string;
  outputDir?: string;
}

/** A generated file ready for download. */
export interface GeneratedFile {
  filename: string;
  content: string;
  path: string;
}

/** Compile code templates with Handlebars. */
export class TemplateEngine {
  private templates = new Map<string, CodeTemplate>();

  /**
   * Register or replace a template.
   * @param template Template and output metadata.
   * @returns Nothing.
   */
  registerTemplate(template: CodeTemplate): void {
    this.templates.set(template.name, { ...template });
  }

  /**
   * Register templates in order.
   * @param templates Templates to register.
   * @returns Nothing.
   */
  registerTemplates(templates: CodeTemplate[]): void {
    for (const template of templates) this.registerTemplate(template);
  }

  /**
   * Render a registered template.
   * @param templateName Registered template name.
   * @param data Template context; filePattern/outputPath may override metadata.
   * @returns Rendered file with a relative output path.
   */
  async generate(templateName: string, data: Record<string, unknown>): Promise<GeneratedFile> {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template not found: ${templateName}`);
    // C source must preserve quotes and angle brackets rather than HTML-encode them.
    const content = Handlebars.compile(template.content, { noEscape: true, strict: true })(data);
    const pattern = typeof data.filePattern === 'string' ? data.filePattern : template.filePattern;
    const filename = pattern.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = data[key];
      if (typeof value !== 'string' && typeof value !== 'number')
        throw new Error(`Missing filename field: ${key}`);
      return String(value);
    });
    const directory =
      typeof data.outputPath === 'string' ? data.outputPath : (template.outputDir ?? '');
    return {
      filename,
      content,
      path: directory ? `${directory.replace(/\/$/, '')}/${filename}` : filename,
    };
  }
}
