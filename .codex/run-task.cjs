// Compatibility entry: all work now goes through the state-aware single dispatcher.
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const state = JSON.parse(readFileSync(path.join(__dirname, 'STATE.json'), 'utf8').replace(/^\uFEFF/, ''));
const requested = process.argv[2];
if (requested && ![state.task?.id, state.task?.id?.replace('TASK-', '')].includes(requested)) {
  console.error('Requested task is not the current STATE task; refusing stale dispatch.');
  process.exit(1);
}
const result = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/autodev/start.ps1')],
  { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
