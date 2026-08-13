# Intelligence Engine Production Runbook

## Supported Entry Point

Run only the canonical engine command:

```bash
NODE_ENV=production pnpm engine:run
```

Legacy JavaScript entry points delegate to this command. The engine uses a PostgreSQL advisory lock, so overlapping scheduled and manual runs fail rather than processing the same clusters concurrently.

## Required Configuration

- `DATABASE_URL`
- `SEC_USER_AGENT` containing a monitored contact email
- `DEEPSEEK_API_KEY`
- `FMP_API_KEY`

Recommended production controls are documented in `.env.example`. Keep `MIN_RESEARCH_PRIORITY=55`, `EVAL_FRESHNESS_HOURS=12`, and `MAX_SOURCE_FAMILY_SHARE=0.5` unless a reviewed experiment requires different values.

## Qualification Policy

- `REJECT`: missing primary evidence or fatal contradiction.
- `WATCH`: unresolved materiality, low materiality, weak relationship confidence, rejected claims, or incomplete research.
- `CANDIDATE`: at least moderate quantified materiality, relationship confidence of 75 or more, and research completeness of 70 or more.
- `VERIFIED`: candidate requirements plus completeness of 85 or more, relationship confidence of 85 or more, measured catalyst attention, measured event-window price reaction, and no material adversarial failure.

Only a canonical `VERIFIED` ResearchReport may publish an opportunity.

## Health And Exit Codes

The process exits nonzero when:

- another engine run holds the advisory lock;
- required production configuration is missing;
- connector failures exceed `MAX_CONNECTOR_FAILURES`;
- partial connectors exceed `MAX_PARTIAL_CONNECTORS`;
- cluster evaluation failure rate exceeds `MAX_EVALUATION_FAILURE_RATE`; or
- thesis monitoring fails.

Alert on any nonzero exit. Logs contain connector duration/counts, triage selection reasons, selected source-family counts, researcher failures, materiality inputs, measured/proxy attention state, event-window returns, persistence status, and final health.

## Release Checks

```bash
pnpm --filter @hidden-catalyst/engine typecheck
pnpm --filter @hidden-catalyst/connectors typecheck
pnpm --filter @hidden-catalyst/engine test
pnpm --filter @hidden-catalyst/domain test
pnpm --filter @hidden-catalyst/db exec prisma validate --schema prisma/schema.prisma
```

Do not deploy when any check fails. A successful dry run should finish with `healthy=true`, no published `WATCH` or `CANDIDATE` records, and no unresolved connector or evaluation failures.
