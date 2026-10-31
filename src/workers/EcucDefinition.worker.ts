import { listEcucModuleNames, importEcucModuleArxml } from '@/core/bswmd/EcucArxmlImporter';

let source = '';
self.onmessage = (event: MessageEvent<{ id: number; source?: string; names?: string[] }>) => {
  const { id } = event.data;
  try {
    if (event.data.source !== undefined) {
      source = event.data.source;
      self.postMessage({ id, names: listEcucModuleNames(source) });
    } else {
      const modules = (event.data.names ?? []).map((name) => importEcucModuleArxml(source, name));
      self.postMessage({ id, modules });
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
