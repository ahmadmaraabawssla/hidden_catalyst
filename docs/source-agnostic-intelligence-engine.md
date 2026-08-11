# Source-Agnostic Intelligence Engine

Hidden Catalyst should start with public-world signals, not a fixed list of companies.

The engine now has first-class primitives for:

1. Signal harvesting
2. Entity resolution
3. Catalyst clustering
4. Cheap research triage
5. Deep research questions
6. Materiality, attention, price-reaction, comparable, and adversarial research
7. Qualification into Reject, Watch, Candidate, or Verified
8. Monitoring and re-evaluation

## Normalized Signal

Every connector should emit the same object shape:

```text
Signal
------
source
source_type
published_at
retrieved_at
title
raw_text
entities[]
event_type
amounts[]
dates[]
locations[]
source_url
source_quality
raw_metadata
```

SEC EDGAR, SAM.gov, USAspending, FDA, ClinicalTrials.gov, USPTO, and future sources should all land on this bus before becoming opportunities.

## Catalyst Cluster

Opportunities should not be created directly from every filing or record.

A catalyst cluster groups related evidence:

```text
Catalyst Cluster: Defense Contract
|-- SAM solicitation
|-- USAspending award
|-- contractor subsidiary
|-- parent public company mapping
|-- revenue / market-cap context
|-- attention and price-reaction checks
|-- adversarial findings
```

The cluster is the research unit. Opportunities are the qualified, user-facing results of that research.

## Triage Before Deep Research

Most public records should never receive expensive research. Cheap triage ranks signals by:

- dollar amount
- company scale
- event type
- source quality
- unusual keywords
- indirect or new relationships
- recency
- apparent financial magnitude

Only high-priority signals should become clusters that receive deep research.

## Qualification

The user-facing statuses are:

- Watch
- Candidate
- Verified

Rejected items remain internal. Qualification requires deterministic gates:

- primary evidence exists
- hidden angle exists
- economic relationship confidence is high enough
- materiality is plausible
- liquidity is acceptable
- no fatal contradiction exists
- data freshness is valid
- evidence quality is sufficient

## Scoring

Opportunity score now combines:

- catalyst strength
- financial materiality
- information asymmetry
- evidence quality
- price reaction / priced-in signal
- timing
- relationship confidence
- research confidence
- risk
- liquidity and dilution penalties

The feed should show opportunity score separately from research confidence and research completeness.

## Current Implementation Points

- Prisma models: `Signal`, `CatalystCluster`, `CatalystClusterSignal`
- Domain types: `NormalizedSignal`, `QualificationStatus`, `CatalystClusterResearch`
- Domain scoring: `calculateResearchPriority`, `qualifyOpportunity`
- Engine helpers: `packages/engine/src/signal-intelligence.ts`
- Connector contract: `ExtractionResult.signals`
- SQL migration: `docs/migration-signal-clusters.sql`
