import { existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alive, now, readJson, runtimeDirectory, writeJson } from './engine.mjs';

// Run inside the designated WorkBuddy task. This process only delivers an event as
// ordinary tool output: it cannot invoke a model, acknowledge for it, or review code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = runtimeDirectory(root);
const listenerPath = resolve(dir, 'workbuddy-listener.json');
const requestPath = resolve(dir, 'workbuddy-request.json');
const receivedPath = resolve(dir, 'workbuddy-received.json');
const timeoutSeconds = Number(process.argv[2] ?? 5400);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 43200) {
  throw new Error('Timeout must be 1..43200 seconds');
}
if (existsSync(listenerPath) && alive(readJson(listenerPath).pid)) {
  throw new Error('Another WorkBuddy listener is active');
}
const startedAt = now();
const deadline = Date.now() + timeoutSeconds * 1000;
try {
  while (Date.now() < deadline) {
    if (existsSync(resolve(dir, 'workbuddy-stop'))) {
      console.log(JSON.stringify({ transportOnly: true, outcome: 'stopped', instruction: '停止监听，不自动重新挂起。保留既有状态。' }));
      break;
    }
    writeJson(listenerPath, { pid: process.pid, startedAt, heartbeatAt: now() });
    if (existsSync(requestPath)) {
      const request = readJson(requestPath);
      const received = existsSync(receivedPath) ? readJson(receivedPath) : null;
      if (typeof request.actionKey !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(request.actionKey)) {
        throw new Error('Invalid request actionKey');
      }
      if (received?.actionKey !== request.actionKey) {
        writeJson(receivedPath, { actionKey: request.actionKey, receivedAt: now(), pid: process.pid });
        console.log(JSON.stringify({ transportOnly: true, request,
          instruction: 'WorkBuddy must acknowledge consumption itself. No review has been performed by this script.' }));
        process.exitCode = 0;
        break;
      }
    }
    await new Promise(res => setTimeout(res, 1000));
  }
  if (Date.now() >= deadline) {
    console.log(JSON.stringify({ transportOnly: true, outcome: 'timeout', instruction: 'No request received. Report the wait limit; do not claim automatic review.' }));
    process.exitCode = 2;
  }
} finally {
  if (existsSync(listenerPath) && readJson(listenerPath).pid === process.pid) unlinkSync(listenerPath);
}
