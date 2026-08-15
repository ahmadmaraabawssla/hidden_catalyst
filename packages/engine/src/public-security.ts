/**
 * Public-security entity resolution — connect a source entity (sponsor,
 * assignee, recipient, subsidiary, product applicant) to a listed security.
 *
 * The source-agnostic architecture discovers events across many sources, but
 * every one of them speaks in names, not tickers: ClinicalTrials.gov has
 * sponsors/drugs, FDA has applicants/manufacturers, SAM has legal recipients +
 * UEI/CAGE, USPTO has assignees. To turn an event into an investable thesis we
 * must resolve that name to a listed parent security — and say how confident
 * we are. This is the single most important gate before spending deep-research
 * budget, and the confidence tier must never be silently dropped.
 *
 * Confidence tiers (strict ordering — never promote across tiers):
 *   verified   — exact identifier (ticker or CIK).
 *   strong     — authoritative name match (exact / normalized / alias).
 *   probable   — high-confidence subsidiary/prefix or fuzzy match.
 *   unresolved — no match; DO NOT publish.
 */

import { prisma } from '@hidden-catalyst/db';

export type ResolutionTier = 'verified' | 'strong' | 'probable' | 'unresolved';

export interface PublicSecurityResolution {
  securityId: string | null;
  ticker: string | null;
  companyName: string | null;
  tier: ResolutionTier;
  matchedBy: string;
}

function normalizeStem(name: unknown): string | null {
  let stem = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  stem = stem.replace(/^the/, '');
  const suffixes = [
    'incorporated', 'corporation', 'company', 'limited', 'holdings', 'holding',
    'group', 'inc', 'corp', 'llc', 'ltd', 'plc', 'co', 'sa', 'ag', 'nv', 'gmbh', 'spa',
    'adr', 'fi',
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return stem.length >= 3 ? stem : null;
}

/**
 * Resolve a source entity name (+ optional ticker/CIK) to a listed security.
 * Returns the security id, ticker, and the confidence tier that produced it.
 * Never returns a "probable"/"verified" match on an empty name.
 */
export async function resolvePublicSecurity(args: {
  ticker?: string | null;
  cik?: string | null;
  companyName?: string | null;
}): Promise<PublicSecurityResolution> {
  const unresolved: PublicSecurityResolution = { securityId: null, ticker: null, companyName: args.companyName ?? null, tier: 'unresolved', matchedBy: 'none' };

  // 1. Ticker — verified (exact identifier).
  if (args.ticker) {
    const security = await prisma.security.findFirst({
      where: { ticker: String(args.ticker).toUpperCase(), active: true },
      include: { company: true },
    });
    if (security) {
      return { securityId: security.id, ticker: security.ticker, companyName: security.company.displayName, tier: 'verified', matchedBy: 'ticker' };
    }
  }

  // 2. CIK — verified (exact identifier).
  if (args.cik) {
    const security = await prisma.security.findFirst({
      where: { company: { cik: String(args.cik).padStart(10, '0') }, active: true },
      include: { company: true },
    });
    if (security) {
      return { securityId: security.id, ticker: security.ticker, companyName: security.company.displayName, tier: 'verified', matchedBy: 'cik' };
    }
  }

  const name = args.companyName;
  if (!name || String(name).trim().length < 2) return unresolved;

  // 3. Exact displayName / legalName — strong.
  const exact = await prisma.security.findFirst({
    where: {
      active: true,
      company: {
        OR: [
          { displayName: { equals: String(name), mode: 'insensitive' } },
          { legalName: { equals: String(name), mode: 'insensitive' } },
        ],
      },
    },
    include: { company: true },
  });
  if (exact) {
    return { securityId: exact.id, ticker: exact.ticker, companyName: exact.company.displayName, tier: 'strong', matchedBy: 'exact_name' };
  }

  // 4. Normalized-stem exact match — strong.
  const stem = normalizeStem(name);
  if (stem) {
    const candidates = await prisma.security.findMany({
      where: { active: true },
      select: { id: true, ticker: true, company: { select: { displayName: true, legalName: true, cik: true } } },
    });

    // Tier 1: exact normalized-stem match.
    const exactStem = candidates.find((c) =>
      normalizeStem(c.company.displayName) === stem ||
      normalizeStem(c.company.legalName) === stem
    );
    if (exactStem) {
      return { securityId: exactStem.id, ticker: exactStem.ticker, companyName: exactStem.company.displayName, tier: 'strong', matchedBy: 'normalized_name' };
    }

    // Tier 2: subsidiary/prefix match — probable. One stem is a prefix of the
    // other with a >=6-char shared prefix (e.g. "BAE Systems Space & Mission
    // Systems" → "BAE Systems PLC").
    if (stem.length >= 6) {
      const subsidiary = candidates.find((c) => {
        const cs = normalizeStem(c.company.displayName) || normalizeStem(c.company.legalName);
        if (!cs) return false;
        const shorter = cs.length < stem.length ? cs : stem;
        return shorter.length >= 6 && (stem.startsWith(cs) || cs.startsWith(stem));
      });
      if (subsidiary) {
        return { securityId: subsidiary.id, ticker: subsidiary.ticker, companyName: subsidiary.company.displayName, tier: 'probable', matchedBy: 'subsidiary_prefix' };
      }
    }
  }

  // 5. Alias table → entity → company mapping (strong when a mapping exists).
  // The graph tables (entity_aliases / entity_mappings) are populated as the
  // system learns; when present they provide an authoritative resolution path.
  const alias = await prisma.entityAlias.findFirst({
    where: { normalizedAlias: normalizeStem(name) ?? String(name).toLowerCase() },
    include: { entity: { include: { entityMappings: { include: { company: { include: { securities: { where: { active: true }, take: 1 } } } } } } } },
  });
  const mappedCompany = alias?.entity?.entityMappings?.[0]?.company;
  const mappedSecurity = mappedCompany?.securities?.[0];
  if (mappedCompany && mappedSecurity) {
    return { securityId: mappedSecurity.id, ticker: mappedSecurity.ticker, companyName: mappedCompany.displayName, tier: 'strong', matchedBy: 'entity_alias_mapping' };
  }

  // 6. Fuzzy match (pg_trgm) — probable. Only when a sufficiently similar
  // canonical entity exists and it maps to a company.
  try {
    const fuzzy = await prisma.$queryRawUnsafe<Array<{ id: string; canonical_name: string; entity_type: string; similarity: number }>>(
      `SELECT id, canonical_name, entity_type, similarity(canonical_name, $1) AS similarity
       FROM entities
       WHERE similarity(canonical_name, $1) > 0.6
       ORDER BY similarity DESC LIMIT 1`,
      name
    );
    const top = fuzzy?.[0];
    if (top && top.similarity > 0.6) {
      const mapping = await prisma.entityMapping.findFirst({
        where: { entityId: top.id },
        include: { company: { include: { securities: { where: { active: true }, take: 1 } } } },
      });
      const sec = mapping?.company?.securities?.[0];
      if (mapping?.company && sec) {
        return { securityId: sec.id, ticker: sec.ticker, companyName: mapping.company.displayName, tier: 'probable', matchedBy: 'fuzzy' };
      }
    }
  } catch {
    // pg_trgm may be unavailable — fall through to unresolved.
  }

  return unresolved;
}
