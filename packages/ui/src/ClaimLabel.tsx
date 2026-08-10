import React from 'react';
import { Badge, type BadgeVariant } from './Badge';

const claimTypeMeta: Record<string, { label: string; variant: BadgeVariant }> = {
  verified_fact: { label: 'Verified Fact', variant: 'success' },
  inference: { label: 'Inference', variant: 'info' },
  estimate: { label: 'Estimate', variant: 'warning' },
  assumption: { label: 'Assumption', variant: 'default' },
  unconfirmed_signal: { label: 'Unconfirmed', variant: 'danger' },
};

interface ClaimLabelProps {
  claimType: string;
}

export function ClaimLabel({ claimType }: ClaimLabelProps) {
  const meta = claimTypeMeta[claimType] ?? { label: claimType, variant: 'default' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
