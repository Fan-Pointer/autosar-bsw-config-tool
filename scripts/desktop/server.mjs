// Always serve the current checkout; do not copy a build into the desktop shortcut.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.argv[2] ?? 3000);
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port, strictPort: true, open: false },
});
await server.listen();
console.log(`OneSAR Configurator serving ${root} at http://localhost:${port}/`);
