#!/usr/bin/env node

/** Compatibility entry point for the retired SEC AI pipeline. */

const { spawnSync } = require('child_process');
const path = require('path');

console.warn('[deprecated] ai-pipeline.js delegates to pnpm engine:run.');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmCommand, ['engine:run'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('[deprecated] Unable to start the source-agnostic engine:', result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status || 0;
}
