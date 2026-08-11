export interface AdversarialInput {
  eventType: string;
  title: string;
  thesis?: string | null;
  materialityRatio?: number | null;
  evidenceQuality?: number | null;
  relationshipConfidence?: number | null;
  priceReactionScore?: number | null;
  hiddenAngle?: Record<string, any> | null;
}

export interface AdversarialFinding {
  severity: 'low' | 'medium' | 'high' | 'fatal';
  finding: string;
}

export interface AdversarialResult {
  findings: AdversarialFinding[];
  fatalContradiction: boolean;
  confidencePenalty: number;
}

export function runDeterministicAdversarialCheck(input: AdversarialInput): AdversarialResult {
  const findings: AdversarialFinding[] = [];
  const eventType = (input.eventType || '').toLowerCase();
  const thesis = `${input.title} ${input.thesis || ''}`.toLowerCase();

  if ((input.relationshipConfidence ?? 100) < 70) {
    findings.push({ severity: 'high', finding: 'Economic relationship to the public security is not strong enough yet.' });
  }
  if ((input.evidenceQuality ?? 100) < 55) {
    findings.push({ severity: 'high', finding: 'Evidence quality is below the candidate threshold.' });
  }
  if ((input.materialityRatio ?? 0) < 0.05) {
    findings.push({ severity: 'medium', finding: 'Computed materiality appears low relative to available denominator.' });
  }
  if ((input.priceReactionScore ?? 100) < 35) {
    findings.push({ severity: 'medium', finding: 'Market reaction may indicate the catalyst is already priced in.' });
  }
  if (/contract|award/.test(eventType) && /ceiling|idiq|maximum|up to/.test(thesis)) {
    findings.push({ severity: 'medium', finding: 'Award amount may be a ceiling rather than guaranteed revenue.' });
  }
  if (/patent/.test(eventType)) {
    findings.push({ severity: 'medium', finding: 'Patent grant alone does not prove commercial value or near-term monetization.' });
  }
  if (/trial|clinical|fda/.test(eventType) && /small|phase 1|early/.test(thesis)) {
    findings.push({ severity: 'medium', finding: 'Clinical signal may be early-stage or underpowered.' });
  }

  const fatalContradiction = findings.some((f) => f.severity === 'fatal');
  const confidencePenalty = findings.reduce((sum, f) => {
    if (f.severity === 'fatal') return sum + 60;
    if (f.severity === 'high') return sum + 25;
    if (f.severity === 'medium') return sum + 12;
    return sum + 5;
  }, 0);

  return { findings, fatalContradiction, confidencePenalty: Math.min(80, confidencePenalty) };
}
