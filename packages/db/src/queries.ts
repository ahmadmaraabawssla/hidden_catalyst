import { prisma } from './index';
import type { Prisma } from '@prisma/client';

// ─── Opportunities ───

export async function getPublishedOpportunities({
  status = 'published',
  verificationStatus,
  minScore,
  maxRisk,
  sector,
  catalystType,
  marketCapMin,
  marketCapMax,
  sort = 'opportunity',
  limit = 50,
  offset = 0,
}: {
  status?: string;
  verificationStatus?: string | string[];
  minScore?: number;
  maxRisk?: number;
  sector?: string;
  catalystType?: string;
  marketCapMin?: number;
  marketCapMax?: number;
  sort?: 'opportunity' | 'recent' | 'asymmetry';
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.OpportunityWhereInput = { status };

  // Core filter: proper exchanges only
  where.security = {
    active: true,
    exchange: { in: ['NYSE', 'NASDAQ', 'NYSE American'] },
  };

  // Market cap filter (only when user explicitly requests)
  if (marketCapMin || marketCapMax) {
    where.security = {
      ...where.security as any,
      marketCap: {
        ...(marketCapMin ? { gte: marketCapMin } : {}),
        ...(marketCapMax ? { lte: marketCapMax } : {}),
      },
    };
  }

  // Sector filter
  if (sector) {
    where.security = {
      ...where.security as any,
      company: { sector: { equals: sector, mode: 'insensitive' } },
    };
  }

  // FIXED: Fetch ALL matching opportunities first, sort in memory,
  // THEN apply pagination. This ensures "top 20 by score" is truly the top 20.
  const allOpportunities = await prisma.opportunity.findMany({
    where,
    include: {
      security: { include: { company: true } },
      scores: true,
      risks: true,
      claims: { where: { claimType: { in: ['verified_fact', 'inference'] } }, take: 3 },
      _count: { select: { claims: true } },
    },
    orderBy: { publishedAt: 'desc' },
  });

  const total = allOpportunities.length;

  // Sort in memory
  if (sort === 'opportunity') {
    allOpportunities.sort((a, b) => {
      const aScore = a.scores.find(s => s.scoreType === 'opportunity')?.value ?? 0;
      const bScore = b.scores.find(s => s.scoreType === 'opportunity')?.value ?? 0;
      return bScore - aScore;
    });
  } else if (sort === 'asymmetry') {
    allOpportunities.sort((a, b) => {
      const aScore = a.scores.find(s => s.scoreType === 'information_asymmetry')?.value ?? 0;
      const bScore = b.scores.find(s => s.scoreType === 'information_asymmetry')?.value ?? 0;
      return bScore - aScore;
    });
  }
  // 'recent' is already sorted by publishedAt desc from the DB query

  // DEFAULT: Filter out mega-caps (>$10B with known market cap) unless user
  // explicitly requested a larger range. Companies with NULL market caps stay.
  let filtered = allOpportunities;
  if (!marketCapMax || marketCapMax <= 10_000_000_000) {
    filtered = allOpportunities.filter(o => {
      const mc = o.security.marketCap;
      return mc === null || mc <= 10_000_000_000;
    });
  }

  return { opportunities: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function getOpportunityById(id: string) {
  return prisma.opportunity.findUnique({
    where: { id },
    include: {
      security: { include: { company: true } },
      event: true,
      claims: true,
      scores: true,
      risks: true,
      invalidationRules: true,
      reviewActions: { include: { actor: { select: { email: true } } }, orderBy: { createdAt: 'desc' } },
      notifications: { take: 0 },
    },
  });
}

export async function getOpportunityEvidence(opportunityId: string) {
  const claims = await prisma.claim.findMany({
    where: { opportunityId },
    select: { evidenceItemIds: true },
  });

  const evidenceIds = [...new Set(claims.flatMap(c => c.evidenceItemIds as string[]))];

  return prisma.evidenceItem.findMany({
    where: { id: { in: evidenceIds } },
    include: { document: { include: { source: true } } },
  });
}

// ─── Companies ───

export async function getCompanyByTicker(ticker: string) {
  const security = await prisma.security.findFirst({
    where: { ticker: ticker.toUpperCase(), active: true },
    include: {
      company: true,
      opportunities: {
        where: { status: { in: ['published', 'invalidated'] } },
        include: {
          scores: { where: { scoreType: 'opportunity' } },
        },
        orderBy: { publishedAt: 'desc' },
      },
    },
  });

  return security;
}

export async function searchCompanies(query: string) {
  return prisma.company.findMany({
    where: {
      OR: [
        { displayName: { contains: query, mode: 'insensitive' } },
        { legalName: { contains: query, mode: 'insensitive' } },
        { securities: { some: { ticker: { contains: query.toUpperCase(), mode: 'insensitive' } } } },
      ],
    },
    include: { securities: { where: { active: true }, take: 1 } },
    take: 10,
  });
}

// ─── Search (with full-text search support) ───

export async function globalSearch(query: string) {
  // If query is short, use standard LIKE search
  if (query.length <= 3) {
    return basicSearch(query);
  }

  // Try full-text search first (needs tsvector columns from migration-fulltext-search.sql)
  try {
    return await fullTextSearch(query);
  } catch {
    // Fall back to basic search if tsvector not available
    return basicSearch(query);
  }
}

async function fullTextSearch(query: string) {
  const tsquery = query.split(/\s+/).map(w => w + ':*').join(' & ');

  const [companies, opportunities, documents] = await Promise.all([
    // Fuzzy name matching with trigram
    prisma.company.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { legalName: { contains: query, mode: 'insensitive' } },
          { securities: { some: { ticker: { contains: query.toUpperCase(), mode: 'insensitive' } } } },
        ],
      },
      include: { securities: { where: { active: true }, take: 1 } },
      take: 10,
    }),
    prisma.opportunity.findMany({
      where: {
        status: 'published',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
          { security: { company: { displayName: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        security: { select: { ticker: true } },
        scores: { where: { scoreType: 'opportunity' }, select: { value: true } },
      },
      take: 10,
    }),
    // Full-text search on documents using tsvector (if available)
    prisma.$queryRawUnsafe<Array<{
      id: string; title: string; published_at: Date; source_name: string;
    }>>(
      `SELECT d.id, d.title, d.published_at, s.name as source_name
       FROM documents d
       JOIN sources s ON d.source_id = s.id
       WHERE d.search_vector @@ to_tsquery('english', $1)
       ORDER BY d.published_at DESC
       LIMIT 10`,
      tsquery
    ).catch(() => []),
  ]);

  // Map raw query result to expected shape
  const docs = Array.isArray(documents) ? documents : [];

  // Infer type based on structure: raw SQL rows vs Prisma typed objects
  const typedDocs = docs.length > 0 && 'source_name' in (docs[0] || {})
    ? (docs as Array<{ id: string; title: string; published_at: Date; source_name: string }>).map(d => ({
        id: d.id,
        title: d.title,
        publishedAt: d.published_at,
        source: { name: d.source_name },
      }))
    : [];

  return { companies, opportunities, documents: typedDocs };
}

async function basicSearch(query: string) {
  const [companies, opportunities, documents] = await Promise.all([
    searchCompanies(query),
    prisma.opportunity.findMany({
      where: {
        status: 'published',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
          { security: { company: { displayName: { contains: query, mode: 'insensitive' } } } },
          { security: { ticker: { contains: query.toUpperCase(), mode: 'insensitive' } } },
        ],
      },
      include: {
        security: { select: { ticker: true } },
        scores: { where: { scoreType: 'opportunity' }, select: { value: true } },
      },
      take: 10,
    }),
    prisma.document.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { text: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { source: { select: { name: true } } },
      take: 10,
      orderBy: { publishedAt: 'desc' },
    }),
  ]);

  return { companies, opportunities, documents };
}

// ─── Watchlists ───

export async function getUserWatchlists(userId: string) {
  return prisma.watchlist.findMany({
    where: { userId },
    include: {
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  }) as any as Promise<Array<{
    id: string;
    name: string;
    createdAt: Date;
    items: Array<{
      id: string;
      entityType: string;
      entityId: string;
    }>;
  }>>;
}

export async function createWatchlist(userId: string, name: string) {
  return prisma.watchlist.create({ data: { userId, name } });
}

export async function addToWatchlist(watchlistId: string, entityType: string, entityId: string) {
  return prisma.watchlistItem.create({
    data: { watchlistId, entityType, entityId },
  });
}

export async function removeFromWatchlist(watchlistId: string, itemId: string) {
  return prisma.watchlistItem.delete({ where: { id: itemId, watchlistId } });
}

// ─── Admin / Review ───

export async function getReviewQueue({
  status = 'needs_review',
  limit = 50,
  offset = 0,
}: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.opportunity.findMany({
    where: { status },
    include: {
      security: { include: { company: true } },
      scores: { where: { scoreType: { in: ['opportunity', 'evidence_quality', 'risk'] } } },
      risks: true,
      _count: { select: { claims: true } },
    },
    orderBy: { detectedAt: 'asc' },
    take: limit,
    skip: offset,
  });
}

export async function reviewAction(
  opportunityId: string,
  actorId: string,
  action: string,
  reason?: string,
  beforeJson?: any,
  afterJson?: any
) {
  return prisma.reviewAction.create({
    data: {
      opportunityId,
      actorId,
      action,
      reason,
      beforeJson,
      afterJson,
    },
  });
}

export async function approveAndPublish(opportunityId: string, actorId: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp) throw new Error('Opportunity not found');

  const beforeJson = { status: opp.status };

  const [updated] = await Promise.all([
    prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'published', publishedAt: new Date(), reviewerId: actorId },
    }),
    reviewAction(opportunityId, actorId, 'approve_publish', undefined, beforeJson, { status: 'published' }),
  ]);

  return updated;
}

export async function rejectOpportunity(opportunityId: string, actorId: string, reason: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp) throw new Error('Opportunity not found');

  const beforeJson = { status: opp.status };

  const [updated] = await Promise.all([
    prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'rejected', reviewerId: actorId },
    }),
    reviewAction(opportunityId, actorId, 'reject', reason, beforeJson, { status: 'rejected' }),
  ]);

  return updated;
}

export async function invalidateOpportunity(opportunityId: string, actorId: string, reason: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp) throw new Error('Opportunity not found');

  const beforeJson = { status: opp.status };

  const [updated] = await Promise.all([
    prisma.opportunity.update({
      where: { id: opportunityId },
      data: { status: 'invalidated', reviewerId: actorId },
    }),
    reviewAction(opportunityId, actorId, 'invalidate', reason, beforeJson, { status: 'invalidated' }),
    prisma.invalidationRule.updateMany({
      where: { opportunityId },
      data: { status: 'triggered', triggeredAt: new Date() },
    }),
  ]);

  return updated;
}

// ─── Sources & Ingestion ───

export async function getSources() {
  return prisma.source.findMany({
    include: {
      _count: { select: { documents: true } },
      ingestionRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });
}

export async function getIngestionRuns(sourceId: string, limit = 20) {
  return prisma.ingestionRun.findMany({
    where: { sourceId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

// ─── Analytics ───

export async function getDashboardStats() {
  const [published, needsReview, totalDocs, totalSources] = await Promise.all([
    prisma.opportunity.count({ where: { status: 'published' } }),
    prisma.opportunity.count({ where: { status: 'needs_review' } }),
    prisma.document.count(),
    prisma.source.count({ where: { enabled: true } }),
  ]);

  return { published, needsReview, totalDocs, totalSources };
}

// ─── Relationship Graph ───

export async function getRelationshipGraph(opportunityId: string) {
  // Get all claims for this opportunity to find entity references
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      security: { include: { company: true } },
      event: true,
    },
  });

  if (!opp) return null;

  // Get all relationships related to the company's entity mappings
  const company = await prisma.company.findUnique({
    where: { id: opp.security.companyId },
    include: {
      entityMappings: { include: { entity: true } },
    },
  });

  if (!company) return null;

  const entityIds = company.entityMappings.map(m => m.entityId);

  // Get all relationships where these entities are involved
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromEntityId: { in: entityIds } },
        { toEntityId: { in: entityIds } },
      ],
    },
    include: {
      fromEntity: { select: { id: true, canonicalName: true, entityType: true } },
      toEntity: { select: { id: true, canonicalName: true, entityType: true } },
    },
  });

  // Collect all unique entities
  const allEntityIds = new Set<string>();
  relationships.forEach(r => {
    allEntityIds.add(r.fromEntityId);
    allEntityIds.add(r.toEntityId);
  });

  const entities = await prisma.entity.findMany({
    where: { id: { in: [...allEntityIds] } },
  });

  return {
    nodes: entities.map(e => ({
      id: e.id,
      label: e.canonicalName,
      type: e.entityType,
      isCompany: entityIds.includes(e.id),
    })),
    edges: relationships.map(r => ({
      from: r.fromEntityId,
      to: r.toEntityId,
      label: r.relationshipType.replace(/_/g, ' '),
      confidence: r.confidence,
      directness: r.directness,
    })),
  };
}
