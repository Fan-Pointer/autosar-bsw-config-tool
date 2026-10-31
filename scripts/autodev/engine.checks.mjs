import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, disposition, artifact, git, writeJson } from './engine.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'autosar-autodev-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.codex/review'), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/product.ts'), 'export const version = 1;');
  writeFileSync(join(root, '.codex/contract.md'), 'agreed scope');
  writeFileSync(join(root, '.codex/report.md'), 'actual test evidence');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Dispatcher fixture']);
  git(root, ['add', '.']); git(root, ['commit', '-qm', 'fixture']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const state = { stage: 'PHASE-2', queue: [], task: { id: 'TASK-X', round: 0,
    status: 'SUBMITTED', submissionCommit: commit, contractPath: '.codex/contract.md', reportPath: '.codex/report.md' } };
  const save = () => writeJson(join(root, '.codex/STATE.json'), state);
  save();
  const review = (status = 'APPROVED') => {
    state.task.status = status;
    state.task.reviewPath = '.codex/review/test.md';
    state.lastReview = { reviewer: 'WorkBuddy', taskId: 'TASK-X', round: 0, reviewedCommit: commit, verdict: status };
    writeFileSync(join(root, '.codex/review/test.md'), `TEST FIXTURE ONLY TASK-X ${commit}`);
    save();
  };
  return { root, state, save, review };
}
const cfg = { maxAttempts: 3, reviewTransportEnabled: true };

test('a submitted task requests WorkBuddy review, empty queue does not mean done', t => {
  const f = fixture(t);
  assert.equal(inspect(f.root).kind, 'review');
  f.review(); assert.equal(inspect(f.root).kind, 'plan');
  f.state.task = null; f.save(); assert.equal(inspect(f.root).kind, 'plan');
});
test('rejects stale approval after product code changes, including untracked source', t => {
  const f = fixture(t); f.review();
  writeFileSync(join(f.root, 'src/new.ts'), 'new source');
  assert.throws(() => inspect(f.root), /Product changed/);
});
test('rejects task, round and commit mismatches and fabricated reviewer identities', t => {
  const f = fixture(t); f.review();
  for (const [field, value] of [['taskId', 'OTHER'], ['round', 1], ['reviewedCommit', '0'.repeat(40)], ['reviewer', 'Codex']]) {
    const previous = f.state.lastReview[field]; f.state.lastReview[field] = value; f.save();
    assert.throws(() => inspect(f.root), /Review does not match/);
    f.state.lastReview[field] = previous;
  }
});
test('interrupted fixes preserve partial working edits and remain repairs, never approvals', t => {
  const f = fixture(t); f.review('CHANGES_REQUESTED');
  writeFileSync(join(f.root, 'src/product.ts'), 'partial repair');
  assert.equal(inspect(f.root).kind, 'implement');
});
test('two failed rounds go back to WorkBuddy for diagnosis, then use the clarified contract', t => {
  const f = fixture(t); f.review('CHANGES_REQUESTED');
  f.state.task.round = 1; f.state.lastReview.round = 1; f.save();
  assert.equal(inspect(f.root).kind, 'replan');
  f.state.task.replannedForRound = 1; f.save(); assert.equal(inspect(f.root).kind, 'implement');
});
test('event remains identical until the contract/report/review or meaningful state changes', t => {
  const f = fixture(t);
  const first = inspect(f.root).key;
  assert.equal(inspect(f.root).key, first);
  writeFileSync(join(f.root, '.codex/report.md'), 'new evidence');
  assert.notEqual(inspect(f.root).key, first);
});
test('restart deduplication, retry backoff and finite attempts', () => {
  const event = { kind: 'implement' };
  assert.equal(disposition(event, { status: 'confirmed' }, cfg), 'quiet');
  assert.equal(disposition(event, { status: 'retryable', attempts: 1, retryAt: 200 }, cfg, 100), 'quiet');
  assert.equal(disposition(event, { status: 'retryable', attempts: 1, retryAt: 200 }, cfg, 300), 'dispatch');
  assert.equal(disposition(event, { status: 'retryable', attempts: 3 }, cfg), 'exhausted');
});
test('handed-off review never gets repeated on timeout; absent transport is explicit', () => {
  const event = { kind: 'review' };
  assert.equal(disposition(event, { status: 'handed_off', deadline: 200 }, cfg, 100), 'quiet');
  assert.equal(disposition(event, { status: 'handed_off', deadline: 200 }, cfg, 300), 'external-timeout');
  assert.equal(disposition(event, null, { ...cfg, reviewTransportEnabled: false }), 'transport-blocked');
});
test('only independent final review can terminate development', t => {
  const f = fixture(t); f.review();
  f.state.delivery = { status: 'READY_FOR_USER_ACCEPTANCE', reviewer: 'Codex',
    reviewedCommit: f.state.task.submissionCommit, reviewPath: f.state.task.reviewPath };
  f.save(); assert.throws(() => inspect(f.root), /Final WorkBuddy review missing/);
  f.state.delivery.reviewer = 'WorkBuddy'; f.save(); assert.equal(inspect(f.root).kind, 'delivered');
});
test('artifact traversal is rejected', () => {
  assert.throws(() => artifact(tmpdir(), '../outside'), /outside repository/);
});
