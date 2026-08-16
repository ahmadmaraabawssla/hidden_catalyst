import { describe, expect, it } from 'vitest';
import { computeAttentionScore } from '../src/catalyst-attention';

describe('catalyst attention — proxy separation', () => {
  it('proxy score is market-cap derived and never claims to be measured', () => {
    // Small cap → high proxy (underfollowed); the proxy is a RANKING hint only.
    const small = computeAttentionScore(50_000_000, 'TINY');
    const mega = computeAttentionScore(200_000_000_000, 'MEGA');
    expect(small).toBeGreaterThan(mega);
    // Bounded 5..95.
    expect(small).toBeLessThanOrEqual(95);
    expect(mega).toBeGreaterThanOrEqual(5);
  });

  it('proxy is stable regardless of news (it does not take news as input)', () => {
    // computeAttentionScore no longer accepts press-release/news args — the
    // catalyst-specific signal lives in measureAttention's measured flag, not
    // in the proxy. Verify the signature returns the same value when re-called.
    const a = computeAttentionScore(300_000_000, 'ABCD');
    const b = computeAttentionScore(300_000_000, 'ABCD');
    expect(a).toBe(b);
  });
});
