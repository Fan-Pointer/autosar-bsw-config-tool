import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import { checkImportSize } from '@/core/io/ConfigJson';

interface Reply {
  id: number;
  names?: string[];
  modules?: BswmdModule[];
  error?: string;
}

/** Own a short-lived background parser for one module-manager file selection. */
export class EcucDefinitionSession {
  private worker = new Worker(new URL('../../workers/EcucDefinition.worker.ts', import.meta.url), {
    type: 'module',
  });
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (value: Reply) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data,
        request = this.pending.get(reply.id);
      this.pending.delete(reply.id);
      if (reply.error) request?.reject(new Error(reply.error));
      else request?.resolve(reply);
    };
    this.worker.onerror = () => this.dispose();
  }
  private request(message: { source?: string; names?: string[] }): Promise<Reply> {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...message });
    });
  }
  /** Read and inspect a local file off the UI thread.
   * @param file User-selected ARXML file. @returns All selectable module names.
   */
  async open(file: File): Promise<string[]> {
    checkImportSize(file.size);
    return (await this.request({ source: await file.text() })).names ?? [];
  }
  /** Parse selected modules in the worker, keeping the editor responsive.
   * @param names Names from the file list. @returns Parsed definitions.
   */
  async parse(names: string[]): Promise<BswmdModule[]> {
    return (await this.request({ names })).modules ?? [];
  }
  /** Release worker memory on close/reselect/unmount.
   * @returns Nothing.
   */
  dispose(): void {
    this.worker.terminate();
    for (const request of this.pending.values())
      request.reject(new Error('模块解析已取消或工作线程不可用'));
    this.pending.clear();
  }
}
