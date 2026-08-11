import { prisma } from '@hidden-catalyst/db';

export interface ThesisMonitoringEvent {
  opportunityId: string;
  state: 'strengthened' | 'weakened' | 'priced_in' | 'invalidated' | 'unchanged';
  reasons: string[];
}

export async function evaluateThesisMonitoring(opportunityId: string): Promise<ThesisMonitoringEvent> {
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      scores: true,
      risks: true,
      invalidationRules: true,
    },
  });

  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  const reasons: string[] = [];
  const priceReaction = opp.scores.find((s) => s.scoreType === 'price_reaction')?.value ?? null;
  const evidence = opp.scores.find((s) => s.scoreType === 'evidence_quality')?.value ?? null;
  const fatalRisk = opp.risks.some((r) => r.severity === 'critical' || r.riskType === 'fatal_contradiction');
  const triggeredInvalidation = opp.invalidationRules.some((r) => r.ruleType === 'invalidation' && r.status === 'triggered');
  const confirmations = opp.invalidationRules.filter((r) => r.ruleType === 'confirmation' && r.status === 'triggered');

  let result: ThesisMonitoringEvent;
  if (triggeredInvalidation || fatalRisk) {
    reasons.push('Fatal contradiction or invalidation trigger detected.');
    result = { opportunityId, state: 'invalidated', reasons };
  } else if (priceReaction != null && priceReaction < 35) {
    reasons.push('Price/volume reaction suggests the catalyst may now be priced in.');
    result = { opportunityId, state: 'priced_in', reasons };
  } else if (confirmations.length > 0 || (evidence != null && evidence >= 85)) {
    reasons.push('Confirmation signal or high-quality evidence supports the thesis.');
    result = { opportunityId, state: 'strengthened', reasons };
  } else if (opp.risks.some((r) => r.riskType === 'contradiction')) {
    reasons.push('Counter-evidence exists and should be reviewed.');
    result = { opportunityId, state: 'weakened', reasons };
  } else {
    result = { opportunityId, state: 'unchanged', reasons: ['No monitoring state change detected.'] };
  }

  if (result.state !== 'unchanged') {
    await prisma.monitoringEvent.create({
      data: {
        opportunityId,
        clusterId: opp.clusterId,
        state: result.state,
        reasons: result.reasons as any,
        source: 'deterministic_monitor',
      },
    }).catch(() => null);
  }

  return result;
}
