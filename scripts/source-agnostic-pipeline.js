#!/usr/bin/env node

/** Compatibility entry point. The TypeScript CLI owns locking and health gates. */

const { spawnSync } = require('child_process');
const path = require('path');

console.warn('[deprecated] source-agnostic-pipeline.js delegates to pnpm engine:run.');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmCommand, ['engine:run'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('[deprecated] Unable to start the intelligence engine:', result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status || 0;
}
