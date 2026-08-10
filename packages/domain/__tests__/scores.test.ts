/**
 * Scoring Engine Tests
 *
 * Run: pnpm test
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOpportunityScore,
  calculateInformationAsymmetry,
  calculateEvidenceQuality,
  calculatePriceReaction,
  canAutoPublish,
  DEFAULT_WEIGHTS,
  SCORE_MODEL_VERSION,
} from '../src/scores';

describe('calculateInformationAsymmetry', () => {
  it('gives high asymmetry to micro-caps with no coverage', () => {
    const result = calculateInformationAsymmetry({
      marketCap: 200_000_000,
      analystCount: 0,
      institutionalOwnership: 5,
      daysSinceLastNews: 35,
    });
    // micro-cap (38) + no analysts (30) + low inst (15) + stale news (15) = 98
    expect(result).toBeGreaterThanOrEqual(90);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('gives low asymmetry to mega-caps with heavy coverage', () => {
    const result = calculateInformationAsymmetry({
      marketCap: 500_000_000_000,
      analystCount: 30,
      institutionalOwnership: 80,
      daysSinceLastNews: 1,
    });
    // mega-cap (2) + many analysts (2) + high inst (2) + fresh news (2) = 8
    expect(result).toBeLessThanOrEqual(20);
  });

  it('handles null values gracefully', () => {
    const result = calculateInformationAsymmetry({
      marketCap: null,
      analystCount: null,
      institutionalOwnership: null,
      daysSinceLastNews: null,
    });
    expect(result).toBeGreaterThanOrEqual(20);
    expect(result).toBeLessThanOrEqual(60);
  });

  it('differentiates small-caps from mid-caps', () => {
    const small = calculateInformationAsymmetry({
      marketCap: 500_000_000,
      analystCount: 3,
      institutionalOwnership: 25,
      daysSinceLastNews: 7,
    });
    const mid = calculateInformationAsymmetry({
      marketCap: 3_000_000_000,
      analystCount: 10,
      institutionalOwnership: 60,
      daysSinceLastNews: 5,
    });
    expect(small).toBeGreaterThan(mid);
  });
});

describe('calculateEvidenceQuality', () => {
  it('ranks government sources highest', () => {
    const quality = calculateEvidenceQuality({
      sourceType: 'government',
      daysSincePublication: 2,
      hasDollarAmounts: true,
      hasNamedParties: true,
      corroboratingSources: 2,
    });
    expect(quality).toBeGreaterThanOrEqual(90);
  });

  it('penalizes old news sources', () => {
    const fresh = calculateEvidenceQuality({
      sourceType: 'news',
      daysSincePublication: 1,
      hasDollarAmounts: false,
      hasNamedParties: false,
      corroboratingSources: 0,
    });
    const old = calculateEvidenceQuality({
      sourceType: 'news',
      daysSincePublication: 45,
      hasDollarAmounts: false,
      hasNamedParties: false,
      corroboratingSources: 0,
    });
    expect(fresh).toBeGreaterThan(old);
  });

  it('SEC 8-K gets high base score', () => {
    const quality = calculateEvidenceQuality({
      sourceType: 'sec_8k',
      daysSincePublication: 3,
      hasDollarAmounts: true,
      hasNamedParties: true,
      corroboratingSources: 1,
    });
    expect(quality).toBeGreaterThanOrEqual(85);
  });
});

describe('calculatePriceReaction', () => {
  it('low price change = high score (not priced in)', () => {
    const score = calculatePriceReaction({
      priceChangePercent: 0.3,
      sectorChangePercent: null,
      volumeChangeRatio: 0.9,
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('high price change = low score (already priced in)', () => {
    const score = calculatePriceReaction({
      priceChangePercent: 8,
      sectorChangePercent: null,
      volumeChangeRatio: 4,
    });
    expect(score).toBeLessThanOrEqual(25);
  });
});

describe('calculateOpportunityScore', () => {
  it('full formula returns valid score', () => {
    const result = calculateOpportunityScore({
      informationAsymmetry: 85,
      catalystStrength: 70,
      evidenceQuality: 90,
      financialMateriality: 60,
      timing: 75,
      priceReaction: 80,
      risk: 30,
      liquidityPenalty: 10,
      dilutionPenalty: 0,
    });

    expect(result.value).toBeGreaterThanOrEqual(1);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(result.modelVersion).toBe(SCORE_MODEL_VERSION);

    // Manual calculation:
    // 0.25*85 + 0.20*70 + 0.20*90 + 0.15*60 + 0.10*75 + 0.10*80 - 0.10*30 - 0.05*10 - 0.05*0
    // = 21.25 + 14 + 18 + 9 + 7.5 + 8 - 3 - 0.5 - 0 = 74.25 ≈ 74
    expect(result.value).toBe(74);
  });

  it('penalizes high risk', () => {
    const highRisk = calculateOpportunityScore({
      informationAsymmetry: 80, catalystStrength: 70, evidenceQuality: 90,
      financialMateriality: 60, timing: 75, priceReaction: 80,
      risk: 90, liquidityPenalty: 10, dilutionPenalty: 0,
    });
    const lowRisk = calculateOpportunityScore({
      informationAsymmetry: 80, catalystStrength: 70, evidenceQuality: 90,
      financialMateriality: 60, timing: 75, priceReaction: 80,
      risk: 10, liquidityPenalty: 10, dilutionPenalty: 0,
    });
    expect(lowRisk.value).toBeGreaterThan(highRisk.value);
  });

  it('clamps to valid range', () => {
    const result1 = calculateOpportunityScore({
      informationAsymmetry: 100, catalystStrength: 100, evidenceQuality: 100,
      financialMateriality: 100, timing: 100, priceReaction: 100,
      risk: 0, liquidityPenalty: 0, dilutionPenalty: 0,
    });
    expect(result1.value).toBeLessThanOrEqual(100);

    const result2 = calculateOpportunityScore({
      informationAsymmetry: 0, catalystStrength: 0, evidenceQuality: 0,
      financialMateriality: 0, timing: 0, priceReaction: 0,
      risk: 100, liquidityPenalty: 100, dilutionPenalty: 100,
    });
    expect(result2.value).toBeGreaterThanOrEqual(1);
  });
});

describe('canAutoPublish', () => {
  it('publishes when all gates pass', () => {
    const result = canAutoPublish(85, 0.98, 0.90, 40, false, true);
    expect(result.canPublish).toBe(true);
  });

  it('rejects when evidence quality is too low', () => {
    const result = canAutoPublish(60, 0.98, 0.90, 40, false, true);
    expect(result.canPublish).toBe(false);
    expect(result.reason).toContain('Evidence');
  });

  it('rejects when risk is too high', () => {
    const result = canAutoPublish(85, 0.98, 0.90, 75, false, true);
    expect(result.canPublish).toBe(false);
    expect(result.reason).toContain('Risk');
  });

  it('rejects when prohibited flags present', () => {
    const result = canAutoPublish(85, 0.98, 0.90, 40, true, true);
    expect(result.canPublish).toBe(false);
  });
});
