/**
 * Entity Resolution Engine
 * 
 * Maps extracted entity names to canonical entities in the database.
 * Uses:
 * 1. Exact ticker match
 * 2. CIK match
 * 3. Trigram fuzzy matching (pg_trgm)
 * 4. Alias table lookup
 */

import { prisma } from '@hidden-catalyst/db';

export interface ResolvedEntity {
  entityId: string;
  canonicalName: string;
  entityType: string;
  confidence: number;
  matchedBy: 'ticker' | 'cik' | 'exact_name' | 'fuzzy' | 'alias' | 'none';
}

export interface ResolvedRelationship {
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  confidence: number;
}

/**
 * Resolve an entity name to a database entity.
 */
export async function resolveEntity(
  name: string,
  context?: { ticker?: string; cik?: string; entityType?: string }
): Promise<ResolvedEntity> {
  // 1. Direct ticker match
  if (context?.ticker) {
    const security = await prisma.security.findFirst({
      where: { ticker: context.ticker.toUpperCase(), active: true },
      include: { company: true },
    });

    if (security) {
      return {
        entityId: `company_${security.company.id}`,
        canonicalName: security.company.displayName,
        entityType: 'company',
        confidence: 1.0,
        matchedBy: 'ticker',
      };
    }
  }

  // 2. CIK match
  if (context?.cik) {
    const company = await prisma.company.findFirst({
      where: { cik: context.cik },
    });

    if (company) {
      return {
        entityId: `company_${company.id}`,
        canonicalName: company.displayName,
        entityType: 'company',
        confidence: 1.0,
        matchedBy: 'cik',
      };
    }
  }

  // 3. Exact name match (case-insensitive)
  const canonicalEntity = await prisma.entity.findFirst({
    where: {
      canonicalName: { equals: name, mode: 'insensitive' },
    },
  });

  if (canonicalEntity) {
    return {
      entityId: canonicalEntity.id,
      canonicalName: canonicalEntity.canonicalName,
      entityType: canonicalEntity.entityType,
      confidence: 0.98,
      matchedBy: 'exact_name',
    };
  }

  // 4. Alias match
  const alias = await prisma.entityAlias.findFirst({
    where: {
      normalizedAlias: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    },
    include: { entity: true },
  });

  if (alias) {
    return {
      entityId: alias.entity.id,
      canonicalName: alias.entity.canonicalName,
      entityType: alias.entity.entityType,
      confidence: 0.85,
      matchedBy: 'alias',
    };
  }

  // 5. Fuzzy name match using pg_trgm similarity
  const fuzzyResult = await prisma.$queryRawUnsafe<Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    similarity: number;
  }>>(
    `SELECT id, canonical_name, entity_type, 
            similarity(canonical_name, $1) as similarity
     FROM entities 
     WHERE similarity(canonical_name, $1) > 0.4
     ORDER BY similarity DESC 
     LIMIT 1`,
    name
  );

  if (fuzzyResult.length > 0 && fuzzyResult[0]) {
    return {
      entityId: fuzzyResult[0].id,
      canonicalName: fuzzyResult[0].canonical_name,
      entityType: fuzzyResult[0].entity_type,
      confidence: fuzzyResult[0].similarity,
      matchedBy: 'fuzzy',
    };
  }

  // 6. No match — return as unresolved
  return {
    entityId: '',
    canonicalName: name,
    entityType: context?.entityType || 'company',
    confidence: 0.3,
    matchedBy: 'none',
  };
}

/**
 * Resolve a relationship between two named entities.
 */
export async function resolveRelationship(
  fromName: string,
  toName: string,
  relationshipType: string,
  confidence: number
): Promise<ResolvedRelationship | null> {
  const [from, to] = await Promise.all([
    resolveEntity(fromName),
    resolveEntity(toName),
  ]);

  if (!from.entityId || !to.entityId) return null;

  return {
    fromEntityId: from.entityId,
    toEntityId: to.entityId,
    relationshipType,
    confidence: Math.min(confidence, from.confidence, to.confidence),
  };
}

/**
 * Create a candidate opportunity from resolved entities and events.
 */
export async function createCandidateOpportunity(
  securityId: string,
  title: string,
  summary: string,
  claims: { claimType: string; text: string; confidence?: number; evidenceItemIds: string[] }[],
  scores?: { scoreType: string; value: number }[]
) {
  const opp = await prisma.opportunity.create({
    data: {
      securityId,
      title,
      summary,
      status: 'candidate',
      detectedAt: new Date(),
    },
  });

  // Create claims
  for (const claim of claims) {
    await prisma.claim.create({
      data: {
        opportunityId: opp.id,
        claimType: claim.claimType,
        text: claim.text,
        confidence: claim.confidence,
        evidenceItemIds: claim.evidenceItemIds,
      },
    });
  }

  // Create scores if provided
  if (scores) {
    for (const score of scores) {
      await prisma.score.create({
        data: {
          opportunityId: opp.id,
          scoreType: score.scoreType,
          value: score.value,
          factors: {},
          modelVersion: '1.0.0',
        },
      });
    }
  }

  return opp;
}
