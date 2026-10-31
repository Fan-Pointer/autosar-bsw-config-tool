import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const now = () => new Date().toISOString();
export const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

/** Contract SHA-256 uses UTF-8 text without BOM and with LF, so Windows checkout is stable. */
export const contractDigest = content => sha(content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));

/** Replace a JSON file atomically; readers never see a half-written journal. */
export function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}

/** Resolve repository-owned handshake artifacts without allowing path escape. */
export function artifact(root, path) {
  if (typeof path !== 'string' || !path) throw new Error('Missing artifact path');
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Artifact outside repository: ${path}`);
  return absolute;
}

const productPaths = ['src', 'tests', 'bswmd', 'templates', 'public', 'package.json',
  'package-lock.json', 'index.html', 'vite.config.ts', 'vitest.config.ts', 'tsconfig.json',
  'tsconfig.app.json', 'tsconfig.node.json'];

export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

/** Reject a review for a different task/round/version, including uncommitted product edits. */
export function checkVersion(root, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('Missing full submissionCommit');
  git(root, ['cat-file', '-e', `${commit}^{commit}`]);
  git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);
  const diff = git(root, ['diff', '--name-only', commit, '--', ...productPaths]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', ...productPaths]);
  if (diff || untracked) throw new Error(`Product changed after submission ${commit}: ${diff || untracked}`);
}

/** State selection is mechanical; no review verdict is inferred by this program. */
export function inspect(root) {
  const state = readJson(resolve(root, '.codex/STATE.json'));
  const task = state.task;
  const hashFile = path => sha(readFileSync(artifact(root, path)));
  const payload = { stage: state.stage, task, lastReview: state.lastReview, delivery: state.delivery };
  let kind;
  if (state.delivery?.status === 'READY_FOR_USER_ACCEPTANCE') {
    const d = state.delivery;
    if (d.reviewer !== 'WorkBuddy' || !d.reviewPath) throw new Error('Final WorkBuddy review missing');
    checkVersion(root, d.reviewedCommit);
    const review = readFileSync(artifact(root, d.reviewPath), 'utf8');
    if (!review.includes(d.reviewedCommit)) throw new Error('Final review has no commit binding');
    kind = 'delivered';
  } else if (!task?.id) {
    kind = 'plan'; // Empty queue is not completion.
  } else {
    if (task.contractPath) {
      payload.contractHash = contractDigest(readFileSync(artifact(root, task.contractPath), 'utf8'));
      if (task.status !== 'BLOCKED' && (!/^[0-9a-f]{64}$/.test(task.contractHash ?? '') ||
          payload.contractHash !== task.contractHash)) {
        throw new Error('Contract hash missing or changed; WorkBuddy must assign the agreed contractHash');
      }
    } else if (task.status !== 'BLOCKED') throw new Error('Task contractPath missing');
    if (task.status === 'READY') kind = 'implement';
    else if (task.status === 'BLOCKED') kind = 'blocked';
    else if (task.status === 'SUBMITTED') {
      checkVersion(root, task.submissionCommit);
      payload.reportHash = hashFile(task.reportPath);
      kind = 'review';
    } else if (['CHANGES_REQUESTED', 'APPROVED'].includes(task.status)) {
      const r = state.lastReview;
      // reviewedCommit is accepted only for the recorded pre-1.1 TASK-002 round 0 handoff.
      const submission = task.submissionCommit ??
        (task.id === 'TASK-002' && task.round === 0 ? task.reviewedCommit : undefined);
      if (r?.reviewer !== 'WorkBuddy' || r.taskId !== task.id || r.round !== task.round ||
          r.reviewedCommit !== submission || r.verdict !== task.status) {
        throw new Error('Review does not match task, round, submissionCommit and verdict');
      }
      if (task.status === 'APPROVED') checkVersion(root, submission);
      else {
        // A repair may have been interrupted with partial edits. Its review remains a repair
        // specification, never an approval of those edits. The worker reconciles before editing.
        git(root, ['cat-file', '-e', `${submission}^{commit}`]);
        git(root, ['merge-base', '--is-ancestor', submission, 'HEAD']);
      }
      const review = readFileSync(artifact(root, task.reviewPath), 'utf8');
      if (!review.includes(submission) || !review.includes(task.id)) throw new Error('Review artifact binding missing');
      payload.reviewHash = sha(review);
      if (task.status === 'APPROVED') kind = 'plan';
      else if (task.round >= 1 && task.replannedForRound !== task.round) kind = 'replan';
      else kind = 'implement';
    } else throw new Error(`Unknown task status: ${task.status}`);
  }
  const key = sha(JSON.stringify({ kind, ...payload })).slice(0, 24);
  return { key, kind, taskId: task?.id ?? null, round: task?.round ?? null, state, observedAt: now() };
}

/** Never execute twice for an unchanged confirmed event. Transient failures have a finite budget. */
export function disposition(event, record, config, time = Date.now()) {
  if (event.kind === 'delivered' || event.kind === 'blocked') return event.kind;
  if (record?.status === 'confirmed') return 'quiet';
  if (record?.status === 'handed_off') return time < record.deadline ? 'quiet' : 'external-timeout';
  if (record?.status === 'blocked') return 'quiet';
  if (record?.attempts >= config.maxAttempts) return 'exhausted';
  if (record?.retryAt > time) return 'quiet';
  if (event.kind !== 'implement' && !config.reviewTransportEnabled) return 'transport-blocked';
  return 'dispatch';
}

export function runtimeDirectory(root) {
  const dir = resolve(root, '.temp/autodev');
  mkdirSync(resolve(dir, 'jobs'), { recursive: true });
  return dir;
}

export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function loadJournal(dir) {
  const path = resolve(dir, 'runtime.json');
  return existsSync(path) ? readJson(path) : { version: 1, records: {}, active: null, notices: {} };
}
