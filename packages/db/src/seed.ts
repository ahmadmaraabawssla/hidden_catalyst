import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sources
  const secEdgar = await prisma.source.upsert({
    where: { id: 'source_sec_edgar' },
    update: {},
    create: {
      id: 'source_sec_edgar',
      name: 'SEC EDGAR',
      family: 'sec_edgar',
      accessType: 'public_free',
      reliabilityTier: 1,
      legalBasis: 'Public government records',
      enabled: true,
    },
  });

  const samGov = await prisma.source.upsert({
    where: { id: 'source_sam_gov' },
    update: {},
    create: {
      id: 'source_sam_gov',
      name: 'SAM.gov Federal Contracts',
      family: 'federal_contracts',
      accessType: 'public_free',
      reliabilityTier: 1,
      legalBasis: 'Public government records',
      enabled: true,
    },
  });

  const fda = await prisma.source.upsert({
    where: { id: 'source_fda' },
    update: {},
    create: {
      id: 'source_fda',
      name: 'FDA',
      family: 'fda',
      accessType: 'public_free',
      reliabilityTier: 1,
      legalBasis: 'Public government records',
      enabled: true,
    },
  });

  const uspto = await prisma.source.upsert({
    where: { id: 'source_uspto' },
    update: {},
    create: {
      id: 'source_uspto',
      name: 'USPTO Patent Grants',
      family: 'patents',
      accessType: 'public_free',
      reliabilityTier: 1,
      legalBasis: 'Public government records',
      enabled: true,
    },
  });

  const clinicalTrials = await prisma.source.upsert({
    where: { id: 'source_clinicaltrials' },
    update: {},
    create: {
      id: 'source_clinicaltrials',
      name: 'ClinicalTrials.gov',
      family: 'clinical_trials',
      accessType: 'public_free',
      reliabilityTier: 2,
      legalBasis: 'Public government records',
      enabled: true,
    },
  });

  // Create companies
  const exm = await prisma.company.upsert({
    where: { id: 'company_exm' },
    update: {},
    create: {
      id: 'company_exm',
      legalName: 'Example Systems Inc.',
      displayName: 'Example Systems',
      cik: '0001234567',
      sector: 'Industrials',
      industry: 'Engineering & Construction',
      website: 'https://example-systems.com',
    },
  });

  const bpi = await prisma.company.upsert({
    where: { id: 'company_bpi' },
    update: {},
    create: {
      id: 'company_bpi',
      legalName: 'BioPharm Innovations Inc.',
      displayName: 'BioPharm Innovations',
      cik: '0002345678',
      sector: 'Healthcare',
      industry: 'Biotechnology',
      website: 'https://biopharm-innovations.com',
    },
  });

  const gtm = await prisma.company.upsert({
    where: { id: 'company_gtm' },
    update: {},
    create: {
      id: 'company_gtm',
      legalName: 'GreenTech Materials Corp.',
      displayName: 'GreenTech Materials',
      cik: '0003456789',
      sector: 'Energy',
      industry: 'Critical Minerals',
      website: 'https://greentech-materials.com',
    },
  });

  const cshi = await prisma.company.upsert({
    where: { id: 'company_cshi' },
    update: {},
    create: {
      id: 'company_cshi',
      legalName: 'CyberShield Corp.',
      displayName: 'CyberShield Corp',
      cik: '0004567890',
      sector: 'Technology',
      industry: 'Cybersecurity',
      website: 'https://cybershield-corp.com',
    },
  });

  const pmt = await prisma.company.upsert({
    where: { id: 'company_pmt' },
    update: {},
    create: {
      id: 'company_pmt',
      legalName: 'Precision MedTech Inc.',
      displayName: 'Precision MedTech',
      cik: '0005678901',
      sector: 'Healthcare',
      industry: 'Medical Devices',
      website: 'https://precision-medtech.com',
    },
  });

  // Create securities
  const exmSecurity = await prisma.security.upsert({
    where: { id: 'sec_exm' },
    update: {},
    create: {
      id: 'sec_exm',
      companyId: exm.id,
      ticker: 'EXM',
      exchange: 'NASDAQ',
      securityType: 'common_stock',
      marketCap: 780_000_000,
      avgDollarVolume: 2_400_000,
    },
  });

  const bpiSecurity = await prisma.security.upsert({
    where: { id: 'sec_bpi' },
    update: {},
    create: {
      id: 'sec_bpi',
      companyId: bpi.id,
      ticker: 'BPI',
      exchange: 'NASDAQ',
      securityType: 'common_stock',
      marketCap: 1_200_000_000,
      avgDollarVolume: 5_100_000,
    },
  });

  const gtmSecurity = await prisma.security.upsert({
    where: { id: 'sec_gtm' },
    update: {},
    create: {
      id: 'sec_gtm',
      companyId: gtm.id,
      ticker: 'GTM',
      exchange: 'NYSE',
      securityType: 'common_stock',
      marketCap: 450_000_000,
      avgDollarVolume: 1_800_000,
    },
  });

  const cshiSecurity = await prisma.security.upsert({
    where: { id: 'sec_cshi' },
    update: {},
    create: {
      id: 'sec_cshi',
      companyId: cshi.id,
      ticker: 'CSHI',
      exchange: 'NYSE American',
      securityType: 'common_stock',
      marketCap: 320_000_000,
      avgDollarVolume: 950_000,
    },
  });

  const pmtSecurity = await prisma.security.upsert({
    where: { id: 'sec_pmt' },
    update: {},
    create: {
      id: 'sec_pmt',
      companyId: pmt.id,
      ticker: 'PMT',
      exchange: 'NASDAQ',
      securityType: 'common_stock',
      marketCap: 2_400_000_000,
      avgDollarVolume: 8_200_000,
    },
  });

  // Create entities
  const doe = await prisma.entity.upsert({
    where: { id: 'entity_doe' },
    update: {},
    create: {
      id: 'entity_doe',
      entityType: 'agency',
      canonicalName: 'U.S. Department of Energy',
      attributes: { jurisdiction: 'federal', domain: 'energy' },
    },
  });

  const bechtel = await prisma.entity.upsert({
    where: { id: 'entity_bechtel' },
    update: {},
    create: {
      id: 'entity_bechtel',
      entityType: 'company',
      canonicalName: 'Bechtel National Inc.',
      attributes: { industry: 'Engineering & Construction' },
    },
  });

  const exmEntity = await prisma.entity.upsert({
    where: { id: 'entity_exm' },
    update: {},
    create: {
      id: 'entity_exm',
      entityType: 'company',
      canonicalName: 'Example Systems Inc.',
      attributes: { industry: 'Engineering & Construction' },
    },
  });

  const bpiEntity = await prisma.entity.upsert({
    where: { id: 'entity_bpi' },
    update: {},
    create: {
      id: 'entity_bpi',
      entityType: 'company',
      canonicalName: 'BioPharm Innovations Inc.',
      attributes: { industry: 'Biotechnology' },
    },
  });

  const gtmEntity = await prisma.entity.upsert({
    where: { id: 'entity_gtm' },
    update: {},
    create: {
      id: 'entity_gtm',
      entityType: 'company',
      canonicalName: 'GreenTech Materials Corp.',
      attributes: { industry: 'Critical Minerals' },
    },
  });

  const cshiEntity = await prisma.entity.upsert({
    where: { id: 'entity_cshi' },
    update: {},
    create: {
      id: 'entity_cshi',
      entityType: 'company',
      canonicalName: 'CyberShield Corp.',
      attributes: { industry: 'Cybersecurity' },
    },
  });

  const pmtEntity = await prisma.entity.upsert({
    where: { id: 'entity_pmt' },
    update: {},
    create: {
      id: 'entity_pmt',
      entityType: 'company',
      canonicalName: 'Precision MedTech Inc.',
      attributes: { industry: 'Medical Devices' },
    },
  });

  // Create entity mappings
  await prisma.entityMapping.upsert({
    where: { id: 'mapping_exm' },
    update: {},
    create: {
      id: 'mapping_exm',
      companyId: exm.id,
      entityId: exmEntity.id,
      confidence: 1.0,
    },
  });

  // Create documents with evidence
  const doc1 = await prisma.document.upsert({
    where: { id: 'doc_1' },
    update: {},
    create: {
      id: 'doc_1',
      sourceId: samGov.id,
      canonicalUrl: 'https://sam.gov/opp/abc123',
      publishedAt: new Date('2026-07-28T14:30:00Z'),
      retrievedAt: new Date('2026-08-01T09:00:00Z'),
      contentHash: 'sha256_doc1_abc123',
      title: 'Modification P00005 — Contract DE-AC02-05CH11231',
      text: 'The U.S. Department of Energy published modification P00005 to contract DE-AC02-05CH11231. The modification increases the total contract ceiling from $185M to $227M, a $42M increase. Period of performance extended through September 30, 2028.',
      language: 'en',
      parserVersion: '1.0.0',
    },
  });

  const ev1 = await prisma.evidenceItem.upsert({
    where: { id: 'ev_1' },
    update: {},
    create: {
      id: 'ev_1',
      documentId: doc1.id,
      excerpt: 'The modification increases the total contract ceiling from $185M to $227M, a $42M increase.',
      evidenceType: 'primary',
      qualityScore: 95,
    },
  });

  const ev2 = await prisma.evidenceItem.upsert({
    where: { id: 'ev_2' },
    update: {},
    create: {
      id: 'ev_2',
      documentId: doc1.id,
      excerpt: 'Period of performance extended through September 30, 2028.',
      evidenceType: 'primary',
      qualityScore: 90,
    },
  });

  // Create relationships
  await prisma.relationship.upsert({
    where: { id: 'rel_exm_doe' },
    update: {},
    create: {
      id: 'rel_exm_doe',
      fromEntityId: exmEntity.id,
      toEntityId: doe.id,
      relationshipType: 'awarded_to',
      confidence: 1.0,
      evidenceId: ev1.id,
    },
  });

  await prisma.relationship.upsert({
    where: { id: 'rel_exm_bechtel' },
    update: {},
    create: {
      id: 'rel_exm_bechtel',
      fromEntityId: exmEntity.id,
      toEntityId: bechtel.id,
      relationshipType: 'partner_of',
      confidence: 0.85,
    },
  });

  // Create event
  const event1 = await prisma.event.upsert({
    where: { id: 'event_1' },
    update: {},
    create: {
      id: 'event_1',
      eventType: 'contract_modification',
      title: 'DOE contract modification expands program ceiling by $42M',
      occurredAt: new Date('2026-07-28T14:30:00Z'),
      primaryEntityId: doe.id,
    },
  });

  // Create opportunity 1: Government Contract
  const opp1 = await prisma.opportunity.upsert({
    where: { id: 'opp_1' },
    update: {},
    create: {
      id: 'opp_1',
      securityId: exmSecurity.id,
      eventId: event1.id,
      title: 'Federal contract modification expands program ceiling',
      summary: 'DOE published a $42M ceiling increase to Example Systems\' primary contract, potentially expanding addressable revenue by 12-18% over two fiscal years.',
      status: 'published',
      detectedAt: new Date('2026-08-01T09:14:00Z'),
      publishedAt: new Date('2026-08-01T14:00:00Z'),
      confidence: 0.85,
    },
  });

  // Claims
  await prisma.claim.upsert({
    where: { id: 'claim_1a' },
    update: {},
    create: {
      id: 'claim_1a',
      opportunityId: opp1.id,
      claimType: 'verified_fact',
      text: 'The U.S. Department of Energy published modification P00005 to contract DE-AC02-05CH11231 on July 28, 2026.',
      evidenceItemIds: ['ev_1'],
    },
  });

  await prisma.claim.upsert({
    where: { id: 'claim_1b' },
    update: {},
    create: {
      id: 'claim_1b',
      opportunityId: opp1.id,
      claimType: 'verified_fact',
      text: 'The modification increases the total contract ceiling from $185M to $227M, a $42M increase.',
      evidenceItemIds: ['ev_1'],
    },
  });

  await prisma.claim.upsert({
    where: { id: 'claim_1c' },
    update: {},
    create: {
      id: 'claim_1c',
      opportunityId: opp1.id,
      claimType: 'inference',
      text: 'The modification may increase addressable revenue by 12-18% over the next two fiscal years.',
      confidence: 0.71,
      evidenceItemIds: ['ev_1', 'ev_2'],
    },
  });

  // Scores
  const scoreTypes = [
    { type: 'information_asymmetry', value: 84 },
    { type: 'catalyst_strength', value: 73 },
    { type: 'evidence_quality', value: 92 },
    { type: 'financial_materiality', value: 69 },
    { type: 'timing', value: 65 },
    { type: 'price_reaction', value: 72 },
    { type: 'risk', value: 42 },
    { type: 'opportunity', value: 78 },
  ];

  for (const st of scoreTypes) {
    await prisma.score.upsert({
      where: { id: `score_${opp1.id}_${st.type}` },
      update: {},
      create: {
        id: `score_${opp1.id}_${st.type}`,
        opportunityId: opp1.id,
        scoreType: st.type,
        value: st.value,
        factors: {},
        modelVersion: '1.0.0',
      },
    });
  }

  // Risks
  await prisma.risk.upsert({
    where: { id: 'risk_1a' },
    update: {},
    create: {
      id: 'risk_1a',
      opportunityId: opp1.id,
      riskType: 'contract_ceiling_not_guaranteed',
      severity: 'medium',
      description: 'Ceiling increase does not guarantee obligated funding.',
    },
  });

  await prisma.risk.upsert({
    where: { id: 'risk_1b' },
    update: {},
    create: {
      id: 'risk_1b',
      opportunityId: opp1.id,
      riskType: 'customer_concentration',
      severity: 'medium',
      description: 'DOE represents approximately 40% of company revenue.',
    },
  });

  // Invalidation rules
  await prisma.invalidationRule.upsert({
    where: { id: 'invrule_1a' },
    update: {},
    create: {
      id: 'invrule_1a',
      opportunityId: opp1.id,
      ruleType: 'confirmation',
      definition: { trigger: 'DOE issues funded task order against modified ceiling within 90 days.' },
      status: 'monitoring',
    },
  });

  await prisma.invalidationRule.upsert({
    where: { id: 'invrule_1b' },
    update: {},
    create: {
      id: 'invrule_1b',
      opportunityId: opp1.id,
      ruleType: 'invalidation',
      definition: { trigger: 'Contract terminated for convenience or company loses re-compete.' },
      status: 'monitoring',
    },
  });

  // ---- Opportunity 2: FDA Fast Track ----
  const doc2 = await prisma.document.upsert({
    where: { id: 'doc_2' },
    update: {},
    create: {
      id: 'doc_2',
      sourceId: fda.id,
      canonicalUrl: 'https://www.fda.gov/media/xyz789',
      publishedAt: new Date('2026-07-25T16:00:00Z'),
      retrievedAt: new Date('2026-07-28T08:00:00Z'),
      contentHash: 'sha256_doc2_xyz789',
      title: 'FDA Fast Track Designation Letter — BPI-301',
      text: 'FDA issued Fast Track designation for BPI-301, an investigational therapy targeting primary biliary cholangitis.',
      language: 'en',
      parserVersion: '1.0.0',
    },
  });

  const ev3 = await prisma.evidenceItem.upsert({
    where: { id: 'ev_3' },
    update: {},
    create: {
      id: 'ev_3',
      documentId: doc2.id,
      excerpt: 'FDA issued Fast Track designation for BPI-301 targeting primary biliary cholangitis.',
      evidenceType: 'primary',
      qualityScore: 90,
    },
  });

  const opp2 = await prisma.opportunity.upsert({
    where: { id: 'opp_2' },
    update: {},
    create: {
      id: 'opp_2',
      securityId: bpiSecurity.id,
      title: 'FDA grants Fast Track designation for rare-disease therapy',
      summary: 'FDA issued Fast Track designation for BPI-301, potentially accelerating the development timeline and increasing probability of approval.',
      status: 'published',
      detectedAt: new Date('2026-07-28T08:30:00Z'),
      publishedAt: new Date('2026-07-28T16:00:00Z'),
      confidence: 0.78,
    },
  });

  const bpiScores = [
    { type: 'information_asymmetry', value: 68 },
    { type: 'catalyst_strength', value: 82 },
    { type: 'evidence_quality', value: 88 },
    { type: 'financial_materiality', value: 76 },
    { type: 'risk', value: 48 },
    { type: 'opportunity', value: 72 },
  ];

  for (const st of bpiScores) {
    await prisma.score.upsert({
      where: { id: `score_${opp2.id}_${st.type}` },
      update: {},
      create: {
        id: `score_${opp2.id}_${st.type}`,
        opportunityId: opp2.id,
        scoreType: st.type,
        value: st.value,
        factors: {},
        modelVersion: '1.0.0',
      },
    });
  }

  await prisma.claim.upsert({
    where: { id: 'claim_2a' },
    update: {},
    create: {
      id: 'claim_2a',
      opportunityId: opp2.id,
      claimType: 'verified_fact',
      text: 'FDA issued Fast Track designation letter for BPI-301 targeting primary biliary cholangitis.',
      evidenceItemIds: ['ev_3'],
    },
  });

  await prisma.claim.upsert({
    where: { id: 'claim_2b' },
    update: {},
    create: {
      id: 'claim_2b',
      opportunityId: opp2.id,
      claimType: 'inference',
      text: 'Fast Track may accelerate development timeline by 6-12 months and increase probability of approval.',
      confidence: 0.68,
      evidenceItemIds: ['ev_3'],
    },
  });

  // ---- Opportunity 3: Environmental Permit ----
  const opp3 = await prisma.opportunity.upsert({
    where: { id: 'opp_3' },
    update: {},
    create: {
      id: 'opp_3',
      securityId: gtmSecurity.id,
      title: 'DOE issues environmental permit for critical minerals processing facility',
      summary: 'DOE published Record of Decision approving the environmental permit for GreenTech\'s lithium processing plant, de-risking the project and unlocking loan guarantee eligibility.',
      status: 'published',
      detectedAt: new Date('2026-07-30T10:00:00Z'),
      publishedAt: new Date('2026-07-30T18:00:00Z'),
      confidence: 0.82,
    },
  });

  const gtmScores = [
    { type: 'information_asymmetry', value: 89 },
    { type: 'catalyst_strength', value: 78 },
    { type: 'evidence_quality', value: 90 },
    { type: 'financial_materiality', value: 84 },
    { type: 'risk', value: 38 },
    { type: 'opportunity', value: 81 },
  ];

  for (const st of gtmScores) {
    await prisma.score.upsert({
      where: { id: `score_${opp3.id}_${st.type}` },
      update: {},
      create: {
        id: `score_${opp3.id}_${st.type}`,
        opportunityId: opp3.id,
        scoreType: st.type,
        value: st.value,
        factors: {},
        modelVersion: '1.0.0',
      },
    });
  }

  // ---- Opportunity 4: Patent Grant ----
  const opp4 = await prisma.opportunity.upsert({
    where: { id: 'opp_4' },
    update: {},
    create: {
      id: 'opp_4',
      securityId: cshiSecurity.id,
      title: 'Patent grant for zero-trust network architecture covering 14 claims',
      summary: 'USPTO granted patent for CyberShield\'s zero-trust network segmentation technology, strengthening IP moat in federal cybersecurity market.',
      status: 'needs_review',
      detectedAt: new Date('2026-07-25T11:00:00Z'),
      confidence: 0.65,
    },
  });

  const cshiScores = [
    { type: 'information_asymmetry', value: 71 },
    { type: 'catalyst_strength', value: 62 },
    { type: 'evidence_quality', value: 85 },
    { type: 'financial_materiality', value: 55 },
    { type: 'risk', value: 52 },
    { type: 'opportunity', value: 65 },
  ];

  for (const st of cshiScores) {
    await prisma.score.upsert({
      where: { id: `score_${opp4.id}_${st.type}` },
      update: {},
      create: {
        id: `score_${opp4.id}_${st.type}`,
        opportunityId: opp4.id,
        scoreType: st.type,
        value: st.value,
        factors: {},
        modelVersion: '1.0.0',
      },
    });
  }

  // Add risks for opp4
  await prisma.risk.upsert({
    where: { id: 'risk_4a' },
    update: {},
    create: {
      id: 'risk_4a',
      opportunityId: opp4.id,
      riskType: 'micro_cap',
      severity: 'high',
      description: 'Market cap of $320M is below $500M micro-cap threshold.',
    },
  });

  await prisma.risk.upsert({
    where: { id: 'risk_4b' },
    update: {},
    create: {
      id: 'risk_4b',
      opportunityId: opp4.id,
      riskType: 'low_liquidity',
      severity: 'high',
      description: 'Average daily dollar volume of $950K is below $1M liquidity threshold.',
    },
  });

  // ---- Opportunity 5: Clinical Trial ----
  const opp5 = await prisma.opportunity.upsert({
    where: { id: 'opp_5' },
    update: {},
    create: {
      id: 'opp_5',
      securityId: pmtSecurity.id,
      title: 'Clinical trial meets primary endpoint; NDA submission planned',
      summary: 'Phase 3 trial of PMT-200 met primary endpoint with statistically significant results, supporting NDA submission by Q1 2027.',
      status: 'published',
      detectedAt: new Date('2026-08-02T07:00:00Z'),
      publishedAt: new Date('2026-08-02T12:00:00Z'),
      confidence: 0.91,
    },
  });

  const pmtScores = [
    { type: 'information_asymmetry', value: 62 },
    { type: 'catalyst_strength', value: 94 },
    { type: 'evidence_quality', value: 95 },
    { type: 'financial_materiality', value: 91 },
    { type: 'risk', value: 45 },
    { type: 'opportunity', value: 86 },
  ];

  for (const st of pmtScores) {
    await prisma.score.upsert({
      where: { id: `score_${opp5.id}_${st.type}` },
      update: {},
      create: {
        id: `score_${opp5.id}_${st.type}`,
        opportunityId: opp5.id,
        scoreType: st.type,
        value: st.value,
        factors: {},
        modelVersion: '1.0.0',
      },
    });
  }

  await prisma.risk.upsert({
    where: { id: 'risk_5a' },
    update: {},
    create: {
      id: 'risk_5a',
      opportunityId: opp5.id,
      riskType: 'binary_outcome',
      severity: 'medium',
      description: 'FDA approval is not guaranteed despite positive Phase 3 results.',
    },
  });

  // ---- Opportunity 6: Invalidated (for demo) ----
  const opp6 = await prisma.opportunity.upsert({
    where: { id: 'opp_6' },
    update: {},
    create: {
      id: 'opp_6',
      securityId: exmSecurity.id,
      title: 'Supposed major DOE contract — invalidated',
      summary: 'This opportunity was invalidated because the contract modification was later rescinded by the agency.',
      status: 'invalidated',
      detectedAt: new Date('2026-06-15T08:00:00Z'),
      publishedAt: new Date('2026-06-16T10:00:00Z'),
      confidence: 0.0,
    },
  });

  await prisma.score.upsert({
    where: { id: `score_${opp6.id}_opportunity` },
    update: {},
    create: {
      id: `score_${opp6.id}_opportunity`,
      opportunityId: opp6.id,
      scoreType: 'opportunity',
      value: 0,
      factors: {},
      modelVersion: '1.0.0',
    },
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Created:');
  console.log('  - 5 sources (SEC EDGAR, SAM.gov, FDA, USPTO, ClinicalTrials.gov)');
  console.log('  - 5 companies (EXM, BPI, GTM, CSHI, PMT)');
  console.log('  - 5 securities');
  console.log('  - 7 entities');
  console.log('  - 2 documents with evidence items');
  console.log('  - 6 opportunities:');
  console.log('    * Government contract (published, score 78)');
  console.log('    * FDA Fast Track (published, score 72)');
  console.log('    * Environmental permit (published, score 81)');
  console.log('    * Patent grant (needs review, score 65)');
  console.log('    * Clinical trial results (published, score 86)');
  console.log('    * Invalidated contract (demo of invalidation flow)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
