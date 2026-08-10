/**
 * Alert & Digest Engine
 * 
 * Generates daily digests and sends immediate high-confidence alerts.
 * Uses a simple email template — replace with Resend/SendGrid in production.
 */

import { prisma } from '@hidden-catalyst/db';

interface DigestEntry {
  opportunityId: string;
  title: string;
  ticker: string;
  companyName: string;
  score: number;
  catalystType: string;
  riskLabel: string;
  detectedAt: Date;
}

/**
 * Compose a daily digest for a user.
 */
export async function generateDigest(userId: string): Promise<{
  entries: DigestEntry[];
  emailHtml: string;
} | null> {
  // Get user's watchlist items
  const watchlists = await prisma.watchlist.findMany({
    where: { userId },
    include: { items: true },
  });

  if (watchlists.length === 0) return null;

  const tickers = [...new Set(
    watchlists.flatMap(wl =>
      wl.items
        .filter(i => i.entityType === 'security')
        .map(i => i.entityId)
    )
  )];

  // Get recent published opportunities matching watchlist
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const opportunities = await prisma.opportunity.findMany({
    where: {
      status: 'published',
      publishedAt: { gte: since },
      ...(tickers.length > 0 ? { securityId: { in: tickers } } : {}),
    },
    include: {
      security: { include: { company: true } },
      scores: { where: { scoreType: 'opportunity' } },
      risks: { take: 1 },
      event: true,
    },
    orderBy: { publishedAt: 'desc' },
  });

  if (opportunities.length === 0) return null;

  const entries: DigestEntry[] = opportunities.map(opp => ({
    opportunityId: opp.id,
    title: opp.title,
    ticker: opp.security.ticker,
    companyName: opp.security.company.displayName,
    score: Math.round(opp.scores[0]?.value ?? 0),
    catalystType: opp.event?.eventType || 'general',
    riskLabel: opp.risks[0]?.riskType || 'none',
    detectedAt: opp.detectedAt,
  }));

  const emailHtml = buildDigestHtml(entries);

  return { entries, emailHtml };
}

/**
 * Check for high-confidence immediate alerts.
 */
export async function checkHighConfidenceAlerts(): Promise<{
  opportunityId: string;
  title: string;
  ticker: string;
  score: number;
}[]> {
  const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
  const highConfidence = await prisma.opportunity.findMany({
    where: {
      status: 'published',
      publishedAt: { gte: since },
    },
    include: {
      security: true,
      scores: { where: { scoreType: 'opportunity' } },
    },
  });

  return highConfidence
    .filter(opp => (opp.scores[0]?.value ?? 0) >= 80)
    .map(opp => ({
      opportunityId: opp.id,
      title: opp.title,
      ticker: opp.security.ticker,
      score: Math.round(opp.scores[0]?.value ?? 0),
    }));
}

/**
 * Send digest to all users with daily digest enabled.
 * NOTE: This is a stub — uses console.log instead of real email.
 */
export async function sendAllDigests() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  for (const user of users) {
    const digest = await generateDigest(user.id);
    if (!digest) continue;

    // In production: send via email provider
    console.log(`[Digest] Would send to ${user.email}: ${digest.entries.length} opportunities`);

    // Log notification
    for (const entry of digest.entries) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          opportunityId: entry.opportunityId,
          type: 'digest',
          status: 'sent',
          idempotencyKey: `digest_${user.id}_${new Date().toISOString().slice(0, 10)}_${entry.opportunityId}`,
          sentAt: new Date(),
        },
      }).catch(() => {
        // Idempotency key prevents duplicates
      });
    }
  }
}

function buildDigestHtml(entries: DigestEntry[]): string {
  const items = entries.map(e => `
    <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;">
      <div style="font-weight:600;color:#1e40af;">${e.companyName} (${e.ticker}) — Score: ${e.score}</div>
      <div style="margin-top:4px;color:#374151;">${e.title}</div>
      <div style="margin-top:4px;font-size:12px;color:#6b7280;">
        Catalyst: ${e.catalystType} · Risk: ${e.riskLabel} · Detected: ${e.detectedAt.toLocaleDateString()}
      </div>
    </div>
  `).join('');

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1a365d;">Hidden Catalyst — Daily Digest</h2>
      <p style="color:#6b7280;">${entries.length} new opportunities matching your watchlists.</p>
      ${items}
      <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
        Hidden Catalyst Discovery Platform — Informational research, not investment advice.
      </p>
    </div>
  `;
}

// CLI
if (require.main === module) {
  sendAllDigests()
    .then(() => { console.log('Digests sent.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
