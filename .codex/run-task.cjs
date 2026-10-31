const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const taskId = process.argv[2];

if (!taskId) {
    console.error('Usage: node run-task.js <TaskId>');
    console.error('Example: node run-task.js 002');
    process.exit(1);
}

const workDir = 'D:\\ProFile\\教培业务\\配置器\\autosar-bsw-config-tool';
const codexPath = 'C:\\Users\\Pointer\\AppData\\Local\\OpenAI\\Codex\\bin\\22cfb1d302613eae\\codex.exe';

// 查找任务文件
const tasksDir = path.join(workDir, '.codex', 'tasks');
const files = fs.readdirSync(tasksDir).filter(f => f.startsWith(`TASK-${taskId}-`) && f.endsWith('.md'));

if (files.length === 0) {
    console.error(`Task file not found: TASK-${taskId}-*.md in .codex/tasks/`);
    process.exit(1);
}

const taskFile = path.join(tasksDir, files[0]);
console.log(`Task: ${files[0]}`);

// 构建提示词
const prompt = `You are a senior TypeScript and Vue 3 engineer working on an AUTOSAR BSW configuration tool.

Please complete the development task described in this file: ${taskFile}

Working directory: ${workDir}

Project context:
- Web-based AUTOSAR BSW configuration tool (similar to Vector DaVinci Configurator)
- Tech stack: Vue 3 + TypeScript + Pinia + Element Plus + Vite
- Core engine must be pure TypeScript (no Vue dependencies)

Requirements:
1. Read the task file carefully
2. Implement ALL required files listed in the task
3. Use strict TypeScript - no 'any' type
4. All exported functions need JSDoc comments
5. Run 'npm install' then 'npm run build' to verify

Start implementing now.

---

Task file content:
${fs.readFileSync(taskFile, 'utf8')}`;

// 写入临时文件
const promptFile = path.join(workDir, '.codex', 'tasks', `.prompt-${taskId}.txt`);
fs.writeFileSync(promptFile, prompt, 'utf8');

console.log('Calling Codex...\n');

// 调用 Codex
const codex = spawn(codexPath, ['exec', '-'], {
    cwd: workDir,
    stdio: ['pipe', 'inherit', 'inherit']
});

// 传递提示词
codex.stdin.write(prompt);
codex.stdin.end();

codex.on('close', (code) => {
    // 清理临时文件
    try { fs.unlinkSync(promptFile); } catch {}
    console.log(`\nCodex finished with code ${code}`);
    process.exit(code);
});
