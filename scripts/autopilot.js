/**
 * Hidden Catalyst — Auto-Pilot Scheduler
 * 
 * Runs continuously, keeping everything updated:
 *   - Market caps (FMP) every 4 hours
 *   - SEC ingestion every 2 hours
 *   - Scoring after each ingestion batch
 * 
 * Usage: node scripts/autopilot.js
 * Leave running in a terminal forever.
 * 
 * In production: replace with Vercel Cron / GitHub Actions / systemd timer.
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run(cmd, label) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 600000 }); // 10 min max
    console.log(`[${ts}] ✓ ${label} done.`);
  } catch (e) {
    console.log(`[${ts}] ⚠ ${label} failed: ${e.message.slice(0, 80)}`);
  }
}

function schedule(fn, intervalHours) {
  fn();
  setInterval(fn, intervalHours * 60 * 60 * 1000);
}

console.log('═══════════════════════════════════════');
console.log('  Hidden Catalyst — Auto-Pilot');
console.log('  Daily Top 20: every 24h (AI analysis)');
console.log('  Market caps: every 4h (FMP)');
console.log('  SEC pipeline: every 2h');
console.log('  Press Ctrl+C to stop.');
console.log('═══════════════════════════════════════\n');

// Daily Top 20: AI-powered curated batch (DeepSeek — ~$0.02/day)
schedule(() => run('node scripts/daily-top20.js', 'Daily Top 20 (AI)'), 24);

// Market caps every 4 hours
schedule(() => run('node scripts/fmp-updater.js', 'Market cap update (FMP)'), 4);

// SEC AI pipeline every 2 hours (10 companies per batch)
schedule(() => run('node scripts/ai-pipeline.js 10', 'SEC AI pipeline'), 2);

console.log('Auto-pilot running. Next market cap update in 4h, next SEC pull in 2h.\n');
