import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { readJson, writeJson, now } from './engine.mjs';

const jobPath = resolve(process.argv[2]);
const job = readJson(jobPath);
const base = jobPath.replace(/\.request\.json$/, '');
const receiptPath = `${base}.receipt.json`;
const resultPath = `${base}.result.json`;
const log = openSync(`${base}.log`, 'a');
const schemaPath = resolve(job.root, '.codex/autodev/receipt.schema.json');
const prompt = `本次由用户授权的本地 AUTODEV 调度器触发，事件 ${job.key}。
工作目录 ${job.root}。完整请求文件 ${jobPath}。
必须先读 AGENTS.md、.codex/STATE.json、.codex/DIVISION-OF-WORK.md、.codex/PROTOCOL.md、.codex/autodev/WORKER.md。
你是 Codex，事件角色 ${job.kind}。不得冒充 WorkBuddy 评审或改 review/stage/契约。
如果 .temp/autodev/user-preferences.json 存在，读取其中用户追加要求；不要忽略用户的界面展示请求。
implement：按真实 READY/CHANGES_REQUESTED 实现或修复、自检、报告、限定范围提交同步、更新提交版本绑定。
review/plan/replan：仅通过受支持 computer-use 向 WorkBuddy「${job.config.workbuddySpace}」空间「${job.config.workbuddyTask}」实际发送请求，不可自行做评审决定。
此项目用户已明确授权双方自动发送消息和 Git 交接，常规开发不再逐轮询问。范围变更和对外发布须用户决定。
${job.reconcile ? '上次执行结果不确定；先核对实际文件、Git 及目标会话，不能重复发已发送请求或覆盖既有成果。' : ''}
如遇权限拒绝、登录缺失，返回 blocked，不绕过。禁止调用其他 Codex 子代理。
只能完成当前事件，不自行启动下一事件。最终按指定 JSON schema 回执 actionKey=${job.key}，明确真实结果与证据。
调度文件由父任务维护，本轮不要修改 scripts/autodev、.codex/autodev、AGENTS.md、PROTOCOL 或 DIVISION。
Git 远端 git@github.com:Fan-Pointer/autosar-bsw-config-tool.git 已在用户当前会话经 GitHub 连接验证为其自有仓库（Fan-Pointer id 85513459，admin/push=true）；仅推送本轮相关内容，禁止 force/add -A。
`;
writeFileSync(`${base}.prompt.txt`, prompt);
writeJson(`${base}.started.json`, { pid: process.pid, at: now(), key: job.key });
try {
  const child = spawn(job.config.codexExecutable, ['exec', '--approve-for-me', '-C', job.root,
    '--output-schema', schemaPath, '-o', receiptPath, '-'],
  { cwd: job.root, windowsHide: true, stdio: ['pipe', log, log] });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  const exitCode = await new Promise((res, rej) => { child.on('error', rej); child.on('exit', res); });
  let receipt;
  try { receipt = readJson(receiptPath); } catch { throw new Error(`Codex exited ${exitCode}; no JSON receipt. See ${base}.log`); }
  if (receipt.actionKey !== job.key || !['completed', 'handed_off', 'blocked', 'retryable'].includes(receipt.outcome)) {
    throw new Error('Receipt key/outcome mismatch');
  }
  if (exitCode !== 0 && receipt.outcome !== 'blocked') throw new Error(`Codex exited ${exitCode}`);
  if (receipt.outcome === 'handed_off' && job.kind === 'implement') throw new Error('Implementer cannot claim reviewer handoff');
  if (receipt.outcome === 'completed' && job.kind === 'implement') {
    const state = readJson(resolve(job.root, '.codex/STATE.json'));
    if (state.task?.id !== job.taskId || state.task.status !== 'SUBMITTED' ||
        !/^[0-9a-f]{40}$/.test(state.task.submissionCommit ?? '')) {
      throw new Error('Implementation returned completed without a bound SUBMITTED state');
    }
  }
  if (receipt.outcome === 'handed_off' && (!receipt.evidence || !receipt.evidence.includes(job.key))) {
    throw new Error('No observed request marker in handoff evidence');
  }
  writeJson(resultPath, { ...receipt, exitCode, finishedAt: now() });
} catch (error) {
  writeJson(resultPath, { actionKey: job.key, outcome: 'retryable', summary: error.message,
    evidence: 'Runner error; inspect log and real state before retry', finishedAt: now() });
} finally { closeSync(log); }
