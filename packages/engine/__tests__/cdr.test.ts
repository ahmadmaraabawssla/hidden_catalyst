import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { findAgreementReferences, findIncorporationReferences } = require('../src/cdr.js');

describe('cross-document reference detection', () => {
  it('finds "as defined in the X dated DATE" references', () => {
    const refs = findAgreementReferences('as defined in the Purchase Agreement dated July 14, 2026');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]?.dateStr).toBe('July 14, 2026');
  });

  it('finds "pursuant to the X dated DATE" references', () => {
    const refs = findAgreementReferences('pursuant to the Equity Line of Credit dated June 2, 2025');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.dateStr === 'June 2, 2025')).toBe(true);
  });

  it('extracts incorporated-by-reference pointers', () => {
    const refs = findIncorporationReferences('incorporated by reference to Exhibit 10.1 of the Form 8-K filed on June 2, 2025');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]?.formType).toBe('8-K');
    expect(refs[0]?.dateStr).toBe('June 2, 2025');
  });

  it('handles abbreviated months in incorporation pointers', () => {
    const refs = findIncorporationReferences('filed as exhibit to the Form S-1 dated Mar 15, 2024');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]?.formType).toBe('S-1');
  });
});
