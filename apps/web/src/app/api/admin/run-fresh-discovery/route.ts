import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — enough for pipeline

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const runId = 'run_' + new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
  const targetCandidates = body.targetCandidates || 20;
  const maxScan = body.maxScan || 500;
  const maxDeepResearch = body.maxDeepResearch || 100;

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  try {
    // Create run record
    await pg.query(
      `INSERT INTO discovery_runs(id, status, engine_version, target_candidates, max_scan, max_deep_research)
       VALUES ($1, 'running', 'v3', $2, $3, $4)`,
      [runId, targetCandidates, maxScan, maxDeepResearch]
    );

    // Run pipeline synchronously from monorepo root
    const rootDir = path.resolve(process.cwd(), '..', '..');
    const scriptPath = path.join(rootDir, 'scripts', 'daily-top20.js');

    let stdout = '';
    let success = false;
    try {
      stdout = execSync(`node "${scriptPath}"`, {
        cwd: rootDir,
        timeout: 240000,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
          FMP_API_KEY: process.env.FMP_API_KEY || '',
          RUN_ID: runId,
          TARGET_CANDIDATES: String(targetCandidates),
          MAX_SCAN: String(maxScan),
          MAX_DEEP_RESEARCH: String(maxDeepResearch),
        },
      }).toString();
      success = true;
    } catch (e: any) {
      stdout = e.stdout?.toString() || '';
      console.error('[Discovery] Pipeline error:', e.stderr?.toString()?.slice(-500));
    }

    // Parse funnel stats
    const screened = stdout.match(/Screened:\s*(\d+)/)?.[1] || '0';
    const filings = stdout.match(/Recent filings:\s*(\d+)/)?.[1] || '0';
    const researched = stdout.match(/Deep researched:\s*(\d+)/)?.[1] || '0';
    const qualified = stdout.match(/Qualified:\s*(\d+)/)?.[1] || '0';
    const rejected = stdout.match(/Rejected\/routine:\s*(\d+)/)?.[1] || '0';
    const watched = stdout.match(/Watch:\s*(\d+)/)?.[1] || '0';

    await pg.query(
      `UPDATE discovery_runs SET status=$1, completed_at=NOW(),
       funnel_screened=$2, funnel_filing_candidates=$3, funnel_deep_researched=$4,
       funnel_qualified=$5, funnel_rejected=$6, funnel_watched=$7
       WHERE id=$8`,
      [success ? 'completed' : 'failed',
       parseInt(screened), parseInt(filings), parseInt(researched),
       parseInt(qualified), parseInt(rejected), parseInt(watched), runId]
    );

    // Tag new v3 opportunities
    if (success) {
      await pg.query(
        `UPDATE opportunities SET run_id=$1, last_researched_at=NOW() WHERE engine_version='v3' AND run_id IS NULL`,
        [runId]
      );
    }

    await pg.end();
    return NextResponse.json({
      success,
      runId,
      funnel: {
        screened: parseInt(screened),
        filingsCandidates: parseInt(filings),
        deepResearched: parseInt(researched),
        qualified: parseInt(qualified),
        rejected: parseInt(rejected),
        watched: parseInt(watched),
      },
      output: stdout.slice(-2000),
    });
  } catch (e: any) {
    await pg.query(`UPDATE discovery_runs SET status='error', error_message=$1 WHERE id=$2`, [e.message, runId]).catch(() => {});
    await pg.end();
    return NextResponse.json({ success: false, error: e.message });
  }
}
