const { spawn } = require('child_process');
const path = require('path');

const frontendDir = '/mnt/c/Users/HP/Desktop/mini_saas/mini_saas_frontend';
const nextPath = path.join(frontendDir, 'node_modules/next/dist/bin/next');

const child = spawn('/mnt/c/nvm4w/nodejs/node.exe', ['dev', '-p', '3000'], {
  cwd: frontendDir,
  detached: true,
  stdio: 'ignore'
});

child.unref();
console.log('Frontend started with PID:', child.pid);