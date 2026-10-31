import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, disposition, runtimeDirectory, loadJournal, readJson, writeJson, alive, now, sha } from './engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = runtimeDirectory(root);
const command = process.argv[2] ?? 'status';
const configPath = resolve(dir, 'config.json');
const defaults = {
  pollSeconds: 15, stableSeconds: 15, maxAttempts: 3, retrySeconds: [60, 300, 900],
  externalTimeoutMinutes: 90, workerTimeoutMinutes: 120, reviewTransportEnabled: false,
  codexExecutable: 'codex', workbuddyTask: '设计 Autosar BSW 配置工具架构', workbuddySpace: '配置器',
};
if (!existsSync(configPath)) writeJson(configPath, defaults);
const config = () => ({ ...defaults, ...readJson(configPath) });
const journalPath = resolve(dir, 'runtime.json');
const lockPath = resolve(dir, 'dispatcher.lock');
const stopPath = resolve(dir, 'stop');
const save = journal => writeJson(journalPath, journal);
const audit = event => appendFileSync(resolve(dir, 'events.jsonl'), JSON.stringify({ at: now(), ...event }) + '\n');
const sleep = ms => new Promise(res => setTimeout(res, ms));

function notice(journal, id, message) {
  if (journal.notices[id]) return;
  journal.notices[id] = { at: now(), message };
  writeJson(resolve(dir, 'attention.json'), { at: now(), id, message });
  audit({ type: 'notice', id, message });
  console.log(message);
  if (process.platform === 'win32') {
    const child = spawn('powershell.exe', ['-NoProfile', '-File', resolve(root, 'scripts/autodev/notify.ps1'),
      '-Message', message.slice(0, 240)], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => {});
  }
}

function status() {
  const journal = loadJournal(dir);
  const lock = existsSync(lockPath) ? readJson(lockPath) : null;
  let event;
  try { event = inspect(root); } catch (error) { event = { error: error.message }; }
  console.log(JSON.stringify({ running: alive(lock?.pid), stopRequested: existsSync(stopPath),
    config: config(), current: event, active: journal.active, last: journal.last,
    workbuddyBusy: existsSync(resolve(dir, 'workbuddy-busy.json')) ? readJson(resolve(dir, 'workbuddy-busy.json')) : null,
    record: journal.records[event.key], attention: existsSync(resolve(dir, 'attention.json'))
      ? readJson(resolve(dir, 'attention.json')) : null }, null, 2));
}

function acquireLock() {
  if (existsSync(lockPath)) {
    const previous = readJson(lockPath);
    if (alive(previous.pid)) throw new Error(`Dispatcher already running: PID ${previous.pid}`);
    unlinkSync(lockPath);
  }
  const fd = openSync(lockPath, 'wx');
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: now() }));
  closeSync(fd);
}

/** Recover a completed child using its durable receipt, never by assuming exit = task success. */
function collect(journal, cfg) {
  const active = journal.active;
  if (!active) return false;
  if (!active.pid) {
    const startedPath = resolve(dir, 'jobs', `${active.jobId}.started.json`);
    if (existsSync(startedPath)) active.pid = readJson(startedPath).pid;
    // Allow the runner to persist its own PID across a crash between spawn and journal save.
    else if (Date.now() - active.startedAt < 60_000) return true;
  }
  if (alive(active.pid)) {
    if (Date.now() - active.startedAt > cfg.workerTimeoutMinutes * 60_000) {
      notice(journal, `stalled-${active.jobId}`, '自动开发执行超时；保留正在运行的工作，停止并发派发。请查看 jobs 日志。');
    }
    return true;
  }
  const record = journal.records[active.key];
  let result;
  try { result = readJson(resolve(dir, 'jobs', `${active.jobId}.result.json`)); }
  catch { result = { outcome: 'retryable', summary: 'Runner exited without a durable result; reconcile before retry' }; }
  if (result.outcome === 'completed' || result.outcome === 'handed_off') {
    record.status = result.outcome === 'completed' ? 'confirmed' : 'handed_off';
    record.deadline = Date.now() + cfg.externalTimeoutMinutes * 60_000;
  } else if (result.outcome === 'blocked') {
    record.status = 'blocked';
    notice(journal, `blocked-${active.key}`, result.summary);
  } else {
    record.status = 'retryable';
    record.retryAt = Date.now() + cfg.retrySeconds[Math.min(record.attempts - 1, cfg.retrySeconds.length - 1)] * 1000;
  }
  record.result = result;
  journal.last = { ...active, finishedAt: now(), result };
  journal.active = null;
  audit({ type: 'result', key: active.key, result });
  return false;
}

function dispatch(event, journal, cfg) {
  const record = journal.records[event.key] ?? { attempts: 0 };
  const jobId = `${event.key}-${record.attempts + 1}`;
  const job = { ...event, jobId, root, config: cfg, reconcile: record.attempts > 0 };
  writeJson(resolve(dir, 'jobs', `${jobId}.request.json`), job);
  // Persist intent before spawn. A crash here is recovered as uncertain, not silently repeated.
  record.attempts += 1;
  record.status = 'running';
  journal.records[event.key] = record;
  journal.active = { key: event.key, jobId, startedAt: Date.now(), pid: null };
  save(journal);
  const child = spawn(process.execPath, [resolve(root, 'scripts/autodev/runner.mjs'),
    resolve(dir, 'jobs', `${jobId}.request.json`)], { cwd: root, windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', error => audit({ type: 'spawn-error', jobId, error: error.message }));
  journal.active.pid = child.pid ?? null;
  child.unref();
  audit({ type: 'dispatch', key: event.key, kind: event.kind, jobId, pid: child.pid });
}

async function run() {
  acquireLock();
  if (existsSync(stopPath)) unlinkSync(stopPath);
  let observed = null;
  let since = 0;
  try {
    while (!existsSync(stopPath)) {
      const cfg = config();
      const journal = loadJournal(dir);
      if (collect(journal, cfg)) { save(journal); await sleep(cfg.pollSeconds * 1000); continue; }
      const busyPath = resolve(dir, 'workbuddy-busy.json');
      if (existsSync(busyPath)) {
        const busy = readJson(busyPath);
        const donePath = resolve(dir, 'workbuddy-done.json');
        const done = existsSync(donePath) ? readJson(donePath) : null;
        if (done?.actionKey === busy.actionKey && done.taskId === busy.taskId && done.round === busy.round) {
          unlinkSync(busyPath);
          audit({ type: 'external-complete', evidence: done });
        } else {
          if (busy.reason) notice(journal, `external-hold-${busy.actionKey}`, busy.reason);
          if (Date.now() > Date.parse(busy.at) + cfg.externalTimeoutMinutes * 60_000) {
            notice(journal, `external-busy-${busy.actionKey}`, 'WorkBuddy 本轮尚未释放交接锁；请查看该任务是否等待权限或登录。不会并发启动 Codex。');
          }
          save(journal); await sleep(cfg.pollSeconds * 1000); continue;
        }
      }
      try {
        const event = inspect(root);
        if (observed !== event.key) { observed = event.key; since = Date.now(); }
        if (Date.now() - since < cfg.stableSeconds * 1000) { save(journal); await sleep(cfg.pollSeconds * 1000); continue; }
        const next = disposition(event, journal.records[event.key], cfg);
        if (journal.stage && journal.stage !== event.state.stage) notice(journal, `stage-${event.key}`, `阶段变更：${event.state.stage}，任务 ${event.taskId}`);
        journal.stage = event.state.stage;
        journal.current = { key: event.key, kind: event.kind, taskId: event.taskId, round: event.round };
        if (next === 'dispatch') dispatch(event, journal, cfg);
        else if (next === 'transport-blocked') notice(journal, `transport-${event.key}`,
          `需要 WorkBuddy ${event.kind}：${event.taskId} round ${event.round}。后台 WorkBuddy 通道尚未获授权；未发送请求。`);
        else if (next === 'exhausted' || next === 'external-timeout') {
          journal.records[event.key].status = 'blocked';
          notice(journal, `${next}-${event.key}`, `自动开发 ${next}：${event.taskId}。查看 runtime.json，排除原因后 recover。`);
        } else if (next === 'blocked') notice(journal, event.key, `项目 BLOCKED：${JSON.stringify(event.state.task.blocker ?? event.state.blocker ?? '请查看 STATE 和任务报告')}`);
        else if (next === 'delivered') {
          notice(journal, event.key, 'WorkBuddy 已完成最终技术评审，产品等待用户验收；自动开发已停止。');
          save(journal); break;
        }
        delete journal.readError;
      } catch (error) {
        const fingerprint = sha(error.message).slice(0, 12);
        const count = journal.readError?.fingerprint === fingerprint ? journal.readError.count + 1 : 1;
        journal.readError = { fingerprint, count, message: error.message };
        if (count >= 3) notice(journal, `validation-${fingerprint}`, `交接校验失败，未派发：${error.message}`);
      }
      save(journal);
      await sleep(cfg.pollSeconds * 1000);
    }
  } finally {
    // Stop is graceful: existing worker is preserved, and recover reattaches to it.
    if (existsSync(lockPath) && readJson(lockPath).pid === process.pid) unlinkSync(lockPath);
  }
}

if (command === 'run') await run();
else if (command === 'status') status();
else if (command === 'stop') { writeFileSync(stopPath, now()); console.log('停止派发；已在执行的本轮会继续完成。'); }
else if (command === 'recover') {
  const journal = loadJournal(dir);
  if (journal.active && alive(journal.active.pid)) throw new Error('Worker still running; wait for it before recovery');
  const event = inspect(root);
  const previous = journal.records[event.key];
  if (previous?.status === 'handed_off') throw new Error('WorkBuddy request already sent; inspect its live task before retrying');
  if (previous) {
    audit({ type: 'explicit-recovery', key: event.key, previous });
    journal.records[event.key] = { attempts: 0, status: 'retryable', recovery: previous };
  }
  delete journal.notices[`transport-${event.key}`];
  save(journal);
  console.log('恢复记录已保存。运行 start.ps1 后从当前真实状态续接。');
} else throw new Error(`Unknown command: ${command}`);
