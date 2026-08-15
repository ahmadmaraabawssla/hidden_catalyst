import { describe, expect, it } from 'vitest';
import { computeIgnoredScore } from '@hidden-catalyst/domain';

describe('computeIgnoredScore', () => {
  it('ranks a large but un-covered company (RKLB-class) as ignored', () => {
    // $46B cap, zero news, thin-ish volume → still scores high on news + volume
    const score = computeIgnoredScore({
      news7d: 0,
      avgDollarVolume: 3_000_000,
      marketCap: 46_000_000_000,
    });
    expect(score).toBeGreaterThanOrEqual(50); // news 45 + volume 10, no cap bonus
  });

  it('ranks a heavily-covered mega-cap (Apple-class) as NOT ignored', () => {
    const score = computeIgnoredScore({
      news7d: 500,
      avgDollarVolume: 5_000_000_000,
      marketCap: 3_000_000_000_000,
    });
    expect(score).toBe(0);
  });

  it('distinguishes an ordinary mid-cap (40 news) from a mega-cap (250 news)', () => {
    const mid = computeIgnoredScore({ news7d: 40, avgDollarVolume: 20_000_000, marketCap: 8_000_000_000 });
    const mega = computeIgnoredScore({ news7d: 250, avgDollarVolume: 1_000_000_000, marketCap: 500_000_000_000 });
    expect(mid).toBeGreaterThan(mega);
  });

  it('gives a tiny, ignored shell a high score (but via news/volume, not just cap)', () => {
    const score = computeIgnoredScore({
      news7d: 0,
      avgDollarVolume: 200_000,
      marketCap: 30_000_000,
    });
    // news 45 + volume 35 + cap 25 = 105 → capped at 100
    expect(score).toBe(100);
  });

  it('does not reward missing data', () => {
    expect(computeIgnoredScore({})).toBe(0);
  });
});
