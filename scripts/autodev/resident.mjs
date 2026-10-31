import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, writeJson, now, git } from './engine.mjs';

const optional = path => existsSync(path) ? readJson(path) : null;

/** A changing heartbeat proves a listener is running even across process permission boundaries. */
export function listenerReady(dir, time = Date.now()) {
  const listener = optional(resolve(dir, 'workbuddy-listener.json'));
  const age = time - Date.parse(listener?.heartbeatAt);
  return Boolean(listener && age >= -5000 && age < 30_000);
}

/** These receipts must be written by the actual WorkBuddy agent, never by the waiter. */
export function matchesAgentAck(ack, request) {
  return ack?.reviewer === 'WorkBuddy' && ack.actionKey === request.actionKey &&
    ack.taskId === request.taskId && ack.round === request.round &&
    (ack.submissionCommit ?? null) === (request.submissionCommit ?? null);
}

/** Publish transport data only. A request file is deliberately not treated as successful invocation. */
export function prepareResident(event, root) {
  return { actionKey: event.key, kind: event.kind, taskId: event.taskId, round: event.round,
    submissionCommit: event.state.task?.submissionCommit ?? null, root, at: now(),
    contractPath: event.state.task?.contractPath ?? null,
    reportPath: event.state.task?.reportPath ?? null,
    reviewPath: event.state.task?.reviewPath ?? null,
    instructionsPath: '.codex/autodev/WORKBUDDY.md',
    instruction: '真实 WorkBuddy 消费此工具输出后先写版本绑定 agent ACK，再按 WORKBUDDY.md 独立评审/规划。只本地提交自己的文件，完成后写 needsSync=true 的 done，重新挂原生后台等待。禁止将脚本 received 当作 agent ACK，禁止降低验收标准。' };
}

export function publishResident(dir, request) {
  writeJson(resolve(dir, 'jobs', `${request.actionKey}.workbuddy-request.json`), request);
  writeJson(resolve(dir, 'workbuddy-busy.json'), { actionKey: request.actionKey,
    taskId: request.taskId, round: request.round, at: request.at, transport: 'resident' });
  writeJson(resolve(dir, 'workbuddy-request.json'), request);
}

/** Resume an uncertain publish using the same key; never re-send a consumed event. */
export function reconcileResident(dir, busy, record, cfg) {
  if (!record?.request) throw new Error('Resident handoff has no persisted request intent');
  const request = record.request;
  const ack = optional(resolve(dir, 'workbuddy-agent-ack.json'));
  if (matchesAgentAck(ack, request)) {
    if (record.status !== 'handed_off') {
      record.status = 'handed_off'; record.agentAck = ack;
      record.deadline = Date.now() + cfg.externalTimeoutMinutes * 60_000;
    }
    return 'acknowledged';
  }
  const received = optional(resolve(dir, 'workbuddy-received.json'));
  const published = optional(resolve(dir, 'workbuddy-request.json'));
  if (received?.actionKey !== busy.actionKey && published?.actionKey !== busy.actionKey && listenerReady(dir)) {
    writeJson(resolve(dir, 'workbuddy-request.json'), request);
  }
  return Date.now() > Date.parse(request.at) + cfg.agentAckTimeoutSeconds * 1000 ? 'ack-timeout' : 'waiting-ack';
}

/** Sync only the reviewer-authored commit. This function cannot write a review or advance STATE. */
export function syncReviewerCommit(root, done) {
  const head = done.headFull ?? done.head;
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw new Error('WorkBuddy done must contain a full commit SHA');
  git(root, ['cat-file', '-e', `${head}^{commit}`]);
  git(root, ['merge-base', '--is-ancestor', head, 'HEAD']);
  const owned = ['.codex/STATE.json', '.codex/tasks', '.codex/review', '.codex/PRODUCT-PLAN.md'];
  if (git(root, ['diff', '--name-only', 'HEAD', '--', ...owned]) ||
      git(root, ['ls-files', '--others', '--exclude-standard', '--', ...owned])) {
    throw new Error('WorkBuddy-owned handoff files are not fully committed');
  }
  try { git(root, ['merge-base', '--is-ancestor', head, 'origin/main']); return head; }
  catch { /* Normal fast-forward push below either succeeds or reports a bounded failure. */ }
  execFileSync('git', ['push', 'origin', `${head}:refs/heads/main`],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: 'pipe' });
  return head;
}

