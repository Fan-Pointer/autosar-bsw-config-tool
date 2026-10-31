import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listenerReady, matchesAgentAck, publishResident, reconcileResident, syncReviewerCommit } from './resident.mjs';
import { readJson, writeJson, git, runtimeDirectory } from './engine.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'autodev-resident-'));
  t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'autodev-resident-'))); rmSync(root, { recursive: true, force: true }); });
  return { root, dir: runtimeDirectory(root) };
}
const request = () => ({ actionKey: 'fixture-only-0001', taskId: 'TASK-FIXTURE', round: 1,
  submissionCommit: 'a'.repeat(40), at: new Date().toISOString(), kind: 'review' });
const cfg = { externalTimeoutMinutes: 90, agentAckTimeoutSeconds: 180 };

test('fresh listener heartbeat is required; stale or future clocks cannot authorize publication', t => {
  const { dir } = fixture(t), time = Date.now();
  assert.equal(listenerReady(dir, time), false);
  for (const [age, expected] of [[0, true], [29_000, true], [31_000, false], [-60_000, false]]) {
    writeJson(join(dir, 'workbuddy-listener.json'), { heartbeatAt: new Date(time-age).toISOString() });
    assert.equal(listenerReady(dir, time), expected);
  }
});

test('agent ACK must bind reviewer, event, task, round and submitted version', () => {
  const r = request(), ack = { ...r, reviewer: 'WorkBuddy' };
  assert.equal(matchesAgentAck(ack, r), true);
  for (const field of ['reviewer', 'actionKey', 'taskId', 'round', 'submissionCommit']) {
    assert.equal(matchesAgentAck({ ...ack, [field]: 'wrong' }, r), false);
  }
});

test('publication and script receipt are not invocation proof; an actual bound ACK releases waiting', t => {
  const { dir } = fixture(t), r = request(), record = { request: r, status: 'awaiting_ack' };
  publishResident(dir, r);
  const busy = readJson(join(dir, 'workbuddy-busy.json'));
  writeJson(join(dir, 'workbuddy-received.json'), { actionKey: r.actionKey });
  assert.equal(reconcileResident(dir, busy, record, cfg), 'waiting-ack');
  assert.equal(record.status, 'awaiting_ack');
  writeJson(join(dir, 'workbuddy-agent-ack.json'), { ...r, reviewer: 'WorkBuddy' });
  assert.equal(reconcileResident(dir, busy, record, cfg), 'acknowledged');
  assert.equal(record.status, 'handed_off');
});

test('waiter returns an event once, never authors agent ACK or product state, and honors stop', t => {
  const { root, dir } = fixture(t), scripts = join(root, 'scripts/autodev'), r = request();
  mkdirSync(scripts, { recursive: true });
  for (const name of ['engine.mjs', 'workbuddy-wait.mjs']) copyFileSync(new URL(name, import.meta.url), join(scripts, name));
  writeJson(join(dir, 'workbuddy-request.json'), r);
  const run = seconds => spawnSync(process.execPath, [join(scripts, 'workbuddy-wait.mjs'), String(seconds)], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  const first = run(2);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).request.actionKey, r.actionKey);
  assert.equal(existsSync(join(dir, 'workbuddy-agent-ack.json')), false);
  assert.equal(existsSync(join(root, '.codex/STATE.json')), false);
  const duplicate = run(1);
  assert.equal(duplicate.status, 2);
  assert.equal(JSON.parse(duplicate.stdout).outcome, 'timeout');
  writeFileSync(join(dir, 'workbuddy-stop'), 'test fixture');
  assert.equal(JSON.parse(run(1).stdout).outcome, 'stopped');
  assert.equal(existsSync(join(dir, 'workbuddy-listener.json')), false);
});

test('Git transport pushes only a confirmed local commit and rejects uncommitted reviewer files', t => {
  const { root } = fixture(t), remote = resolve(root, 'remote.git'), repo = resolve(root, 'repo');
  mkdirSync(repo); git(root, ['init', '--bare', '-q', remote]);
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Resident fixture']); git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  mkdirSync(join(repo, '.codex/review'), { recursive: true });
  writeFileSync(join(repo, '.codex/STATE.json'), '{"fixtureOnly":true}');
  git(repo, ['add', '.codex/STATE.json']); git(repo, ['commit', '-qm', 'fixture base']);
  git(repo, ['remote', 'add', 'origin', remote]); git(repo, ['push', '-q', '-u', 'origin', 'main']);
  writeFileSync(join(repo, '.codex/review/fixture.md'), 'TEST FIXTURE, not a real review');
  git(repo, ['add', '.codex/review/fixture.md']); git(repo, ['commit', '-qm', 'fixture review']);
  const head = git(repo, ['rev-parse', 'HEAD']);
  assert.equal(syncReviewerCommit(repo, { head }), head);
  assert.equal(git(root, ['--git-dir', remote, 'rev-parse', 'main']), head);
  writeFileSync(join(repo, '.codex/STATE.json'), '{"fixtureOnly":true,"pending":true}');
  assert.throws(() => syncReviewerCommit(repo, { head }), /not fully committed/);
  assert.throws(() => syncReviewerCommit(repo, { head: 'short' }), /full commit/);
});
