import { describe, expect, it } from 'vitest';
import {
  buildResearchReport,
  computeMateriality,
  ContractDeepResearcher,
  createDefaultResearchRegistry,
  DeepResearchRegistry,
  mergeDeepResearch,
  PatentDeepResearcher,
  RegulatoryDeepResearcher,
  runDeterministicAdversarialCheck,
  SecDeepResearcher,
  type DeepResearchContext,
} from '../src';
import { formatCapabilityLog, validateProductionConfig } from '../src/cli';

function context(sourceType: string, metadata: Record<string, unknown> = {}): DeepResearchContext {
  return {
    clusterId: 'cluster_fixture',
    title: 'Fixture catalyst',
    clusterType: sourceType,
    company: { companyName: 'Example Public Co', ticker: 'EXM', revenue: 100_000_000 },
    signals: [{
      id: 'signal_fixture',
      title: 'Fixture public record',
      sourceType,
      sourceUrl: 'https://example.test/source',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      rawText: 'Primary public-source fixture.',
      rawMetadata: metadata,
      amounts: [{ value: 25_000_000, label: 'award_amount', currency: 'USD' }],
      sourceQuality: 95,
    }],
  };
}

describe('deep researcher registry', () => {
  it('selects researchers by signal family and prevents duplicate registration', () => {
    const registry = createDefaultResearchRegistry();
    expect(registry.select(context('sec_filing')).map((item) => item.id)).toEqual(['sec-deep-v1']);
    expect(registry.select(context('federal_contract')).map((item) => item.id)).toEqual(['contract-grant-v1']);
    expect(() => new DeepResearchRegistry().register(new PatentDeepResearcher()).register(new PatentDeepResearcher())).toThrow(/already registered/);
  });
});

describe('source-specific deterministic research', () => {
  it('maps contract and grant evidence', async () => {
    const result = await new ContractDeepResearcher().research(context('federal_contract', { recipient: 'Example Public Co', agency: 'Department of Energy', awardId: 'A-1' }));
    expect(result.amounts[0]?.value).toBe(25_000_000);
    expect(result.attributes.agency).toBe('Department of Energy');
    expect(result.relationshipConfidence).toBeGreaterThan(70);
  });

  it('maps regulatory and clinical evidence', async () => {
    const result = await new RegulatoryDeepResearcher().research(context('clinical_trial', { company: 'Example Public Co', nctId: 'NCT001', phase: 'PHASE3', status: 'COMPLETED' }));
    expect(result.attributes.phase).toBe('PHASE3');
    expect(result.verifiedFacts[0]?.text).toContain('COMPLETED');
  });

  it('keeps patent commercialization as an adversarial caveat', async () => {
    const result = await new PatentDeepResearcher().research(context('patent_grant', { assignee: 'Example Public Co', patentNumber: '123' }));
    expect(result.contradictions[0]).toContain('does not itself prove');
  });

  it('maps SEC evidence without requiring an LLM when no accession is present', async () => {
    const result = await new SecDeepResearcher().research(context('sec_filing', { formType: '8-K' }));
    expect(result.attributes.formType).toBe('8-K');
    expect(result.verifiedFacts).toHaveLength(1);
  });
});

describe('fixture source-to-report flow', () => {
  it('runs normalized contract signal through research, report, and qualification', async () => {
    const fixture = context('contract_award', { recipient: 'Example Public Co', agency: 'Department of Energy', awardId: 'A-1' });
    const deep = mergeDeepResearch(await createDefaultResearchRegistry().run(fixture));
    const materiality = computeMateriality({ eventType: 'contract_award', amount: 25_000_000, revenue: fixture.company.revenue });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: 'contract_award', title: fixture.title, thesis: deep.thesis,
      materialityRatio: materiality.ratio, evidenceQuality: 95,
      relationshipConfidence: deep.relationshipConfidence,
    });
    const report = buildResearchReport({
      title: fixture.title, eventType: fixture.clusterType, thesis: deep.thesis,
      signals: fixture.signals, materiality, adversarial,
      relationshipConfidence: deep.relationshipConfidence,
      attentionAvailable: true, priceReactionAvailable: true, deepResearch: deep,
    });
    expect(deep.researchers).toEqual(['contract-grant-v1']);
    expect(report.researchChecks.find((check) => check.id === 'deep_research')?.status).toBe('verified');
    expect(['candidate', 'verified']).toContain(report.thesisStatus);
  });

  it('keeps low-materiality contracts on watch even when other checks are complete', async () => {
    const fixture = context('contract_award', { recipient: 'Example Public Co', agency: 'Department of Energy', awardId: 'A-2' });
    fixture.signals[0]!.amounts = [{ value: 1_000_000, label: 'award_amount', currency: 'USD' }];
    const deep = mergeDeepResearch(await createDefaultResearchRegistry().run(fixture));
    const materiality = computeMateriality({ eventType: 'contract_award', amount: 1_000_000, revenue: 100_000_000 });
    const adversarial = runDeterministicAdversarialCheck({
      eventType: 'contract_award', title: fixture.title, thesis: deep.thesis,
      materialityRatio: materiality.ratio, evidenceQuality: 95, relationshipConfidence: 90,
    });
    const report = buildResearchReport({
      title: fixture.title, eventType: fixture.clusterType, thesis: deep.thesis,
      signals: fixture.signals, materiality, adversarial, relationshipConfidence: 90,
      attentionAvailable: true, attentionMeasured: true,
      priceReactionAvailable: true, priceReactionMeasured: true, deepResearch: deep,
    });
    expect(materiality.level).toBe('LOW');
    expect(report.thesisStatus).toBe('watch');
    expect(report.qualificationReasons).toContain('Quantified materiality is below the candidate threshold.');
  });

  it('requires measured attention and price reaction for verified status', async () => {
    const fixture = context('contract_award', { recipient: 'Example Public Co', agency: 'Department of Energy', awardId: 'A-3' });
    fixture.signals.push({ ...fixture.signals[0]!, id: 'signal_corroborating', sourceType: 'sec_filing' });
    const deep = mergeDeepResearch(await new DeepResearchRegistry().register(new ContractDeepResearcher()).run(fixture));
    const materiality = computeMateriality({ eventType: 'contract_award', amount: 25_000_000, revenue: 100_000_000 });
    const adversarial = runDeterministicAdversarialCheck({ eventType: fixture.clusterType, title: fixture.title, thesis: deep.thesis, materialityRatio: materiality.ratio, evidenceQuality: 95, relationshipConfidence: 90 });
    const report = buildResearchReport({
      title: fixture.title, eventType: fixture.clusterType, thesis: deep.thesis,
      signals: fixture.signals, materiality, adversarial, relationshipConfidence: 90,
      attentionAvailable: true, attentionMeasured: false,
      priceReactionAvailable: true, priceReactionMeasured: false, deepResearch: deep,
    });
    expect(report.thesisStatus).toBe('candidate');
  });
});

describe('logging safety', () => {
  it('reports capability presence without exposing secrets', () => {
    const line = formatCapabilityLog({ DATABASE_URL: 'postgres://secret', DEEPSEEK_API_KEY: 'secret-key', SEC_USER_AGENT: 'private@example.com' });
    expect(line).toContain('database=true');
    expect(line).not.toContain('postgres://');
    expect(line).not.toContain('secret-key');
    expect(line).not.toContain('private@example.com');
  });

  it('requires market and research credentials in production', () => {
    expect(() => validateProductionConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://present',
      SEC_USER_AGENT: 'Hidden Catalyst research@example.com',
    })).toThrow(/DEEPSEEK_API_KEY, FMP_API_KEY/);
    expect(() => validateProductionConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://present',
      SEC_USER_AGENT: 'Hidden Catalyst research@example.com',
      DEEPSEEK_API_KEY: 'present',
      FMP_API_KEY: 'present',
    })).not.toThrow();
  });
});
