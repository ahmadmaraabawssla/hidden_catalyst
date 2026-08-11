import { describe, expect, it } from 'vitest';
import {
  calculatePriceReactionWindows,
  computeMateriality,
  runDeterministicAdversarialCheck,
} from '../src';

describe('computeMateriality', () => {
  it('classifies contract value against revenue', () => {
    const result = computeMateriality({
      eventType: 'contract_award',
      amount: 25_000_000,
      revenue: 100_000_000,
    });

    expect(result.metric).toBe('contract value / revenue');
    expect(result.level).toBe('HIGH');
    expect(result.ratio).toBeCloseTo(0.25);
  });

  it('classifies liabilities against cash', () => {
    const result = computeMateriality({
      eventType: 'liability',
      amount: 8_000_000,
      cash: 10_000_000,
    });

    expect(result.metric).toBe('liability / cash');
    expect(result.level).toBe('EXTREME');
  });
});

describe('calculatePriceReactionWindows', () => {
  it('returns window returns and priced-in score', () => {
    const eventDate = new Date('2026-01-21T00:00:00Z');
    const prices = Array.from({ length: 50 }).map((_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      close: 10 + i * 0.05,
      volume: 100_000 + i * 1_000,
    }));

    const result = calculatePriceReactionWindows(prices, eventDate);

    expect(result.returns.t1).not.toBeNull();
    expect(result.returns.p5).not.toBeNull();
    expect(result.pricedInScore).toBeGreaterThanOrEqual(0);
    expect(result.pricedInScore).toBeLessThanOrEqual(100);
  });
});

describe('runDeterministicAdversarialCheck', () => {
  it('flags weak, low-materiality theses without inventing a prediction', () => {
    const result = runDeterministicAdversarialCheck({
      eventType: 'patent_grant',
      title: 'Patent issued',
      thesis: 'A patent was granted.',
      relationshipConfidence: 45,
      materialityRatio: 0.01,
      evidenceQuality: 50,
      priceReactionScore: 80,
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.confidencePenalty).toBeGreaterThan(0);
  });
});
