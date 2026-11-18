import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`\n[${name}] 退出，code=${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('server', process.execPath, ['server/index.js']);
run('client', process.execPath, ['node_modules/vite/bin/vite.js']);

console.log('\n开发模式启动中：前端 http://localhost:5173  后端 http://localhost:8787\n');
