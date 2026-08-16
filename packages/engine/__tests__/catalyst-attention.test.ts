import { describe, expect, it } from 'vitest';
import { computeAttentionScore, classifyAttention } from '../src/catalyst-attention';

describe('catalyst attention — proxy separation', () => {
  it('proxy score is market-cap derived and never claims to be measured', () => {
    const small = computeAttentionScore(50_000_000, 'TINY');
    const mega = computeAttentionScore(200_000_000_000, 'MEGA');
    expect(small).toBeGreaterThan(mega);
    expect(small).toBeLessThanOrEqual(95);
    expect(mega).toBeGreaterThanOrEqual(5);
  });
});

describe('catalyst attention — the epistemic contract (unknown != overlooked)', () => {
  it('a catalyst-specific news match => measured', () => {
    const r = classifyAttention({ catalystMatches: 3, pressReleaseFound: false });
    expect(r.measured).toBe(true);
    expect(r.attentionStatus).toBe('measured');
  });

  it('a matching press release => measured even with zero news matches', () => {
    const r = classifyAttention({ catalystMatches: 0, pressReleaseFound: true });
    expect(r.measured).toBe(true);
    expect(r.attentionStatus).toBe('measured');
  });

  it('ZERO catalyst matches => unknown, even when the company has generic news', () => {
    // This is the core rule: "no articles returned → overlooked" is FALSE.
    // A company can have 50 generic articles and still be UNKNOWN for the
    // specific catalyst. classifyAttention only sees the catalyst-specific match
    // count (0 here) and must NOT infer "overlooked".
    const r = classifyAttention({ catalystMatches: 0, pressReleaseFound: false });
    expect(r.measured).toBe(false);
    expect(r.attentionStatus).toBe('unknown');
  });

  it('never returns "overlooked" — the vocabulary is only measured/unknown', () => {
    // The contract explicitly forbids an "overlooked" state until verified.
    const r = classifyAttention({ catalystMatches: 0, pressReleaseFound: false });
    expect(r.attentionStatus === 'measured' || r.attentionStatus === 'unknown').toBe(true);
  });
});
