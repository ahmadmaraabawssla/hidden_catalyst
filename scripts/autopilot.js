/**
 * Hidden Catalyst — Auto-Pilot Scheduler v2
 *
 * Daily schedule (Israel time, Asia/Jerusalem):
 *   23:30 — Market cap refresh (fmp-updater.js)
 *   00:01 — Discover new opportunities (daily-top20.js)
 *
 * On startup, waits until the next scheduled run.
 * If today's window has passed, schedules for tomorrow.
 *
 * Usage: node scripts/autopilot.js
 * Leave running. Press Ctrl+C to stop.
 */

const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const TZ = 'Asia/Jerusalem';

function run(cmd, label) {
  const now = new Date();
  const ts = now.toLocaleString('en-IL', { timeZone: TZ });
  console.log(`[${ts}] ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 900000 }); // 15 min
    const done = new Date().toLocaleString('en-IL', { timeZone: TZ });
    console.log(`[${done}] OK ${label}`);
  } catch (e) {
    const fail = new Date().toLocaleString('en-IL', { timeZone: TZ });
    console.log(`[${fail}] FAIL ${label}: ${e.message.slice(0, 80)}`);
  }
}

/**
 * Calculate milliseconds until the next occurrence of (hour:minute)
 * in Asia/Jerusalem timezone.
 *
 * Strategy: try both today and tomorrow as Date strings interpreted in
 * the target timezone. Take whichever is in the future.
 */
function msUntilIsrael(hour, minute) {
  const now = new Date();

  // Build "today at hour:minute" in Israel time
  // by creating a date string and parsing it with the timezone
  const todayStr = now.toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const isoStr = `${todayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const target = new Date(isoStr + '+03:00'); // Israel summer offset

  if (target > now) {
    return target.getTime() - now.getTime();
  }

  // Already passed — schedule for tomorrow
  const tomorrow = new Date(target);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getTime() - now.getTime();
}

function formatIsrael(date) {
  return date.toLocaleString('en-IL', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Schedule a job daily at a fixed Israel time.
 */
function scheduleDaily(label, hour, minute, cmd) {
  function scheduleNext() {
    const delay = msUntilIsrael(hour, minute);
    const nextRun = new Date(Date.now() + delay);

    console.log(`  ${label.padEnd(30)} → ${formatIsrael(nextRun)}  (${Math.round(delay / 60000)} min)`);

    setTimeout(() => {
      run(cmd, label);
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

// ─── Main ───

console.log('═══════════════════════════════════════');
console.log('  Hidden Catalyst — Auto-Pilot v2');
console.log(`  Started: ${formatIsrael(new Date())}`);
console.log('');
console.log('  Daily schedule (Israel time):');
console.log('    23:30 — Market cap refresh');
console.log('    00:01 — Discover Top 20');
console.log('  Press Ctrl+C to stop.');
console.log('═══════════════════════════════════════\n');

scheduleDaily('Market cap update (FMP)', 23, 30, 'node scripts/fmp-updater.js');
scheduleDaily('Daily Top 20 (AI)', 0, 1, 'node scripts/daily-top20.js');

console.log('\nAuto-pilot running. Waiting for next scheduled job...\n');
