const BASE = 'http://localhost:3000';
const CRON_URL = BASE + '/api/cron';

async function trigger() {
  console.log('[' + new Date().toISOString() + '] Running pipeline...');
  try {
    const res = await fetch(CRON_URL, {
      headers: { Authorization: 'Bearer dev-secret' }
    });
    const text = await res.text();
    console.log('  Status:', res.status, text.slice(0, 300));
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

console.log('Scheduler started. Running every 60 min. Ctrl+C to stop.\n');
trigger();
setInterval(trigger, 60 * 60 * 1000);
