# ADR-001: Monorepo Structure & Technology Stack

**Date:** 2026-08-06
**Status:** Accepted
**Author:** Engineering Team

## Context

Hidden Catalyst Discovery Platform is an evidence-first public-market intelligence website. The PRD prescribes a TypeScript-first monorepo with Next.js frontend, PostgreSQL database, Redis-backed job queue, and S3-compatible object storage. We need to decide on specific tooling and structure for the MVP.

## Decision

### Monorepo Tooling
- **pnpm workspaces + Turborepo** — pnpm is fast, disk-efficient, and widely used in the Next.js ecosystem. Turborepo provides incremental builds, parallel execution, and caching.

### Frontend & API
- **Next.js 14 (App Router)** — Single repository for both the web frontend and API routes. Reduces infrastructure complexity for MVP. TypeScript + Tailwind CSS for styling.
- No separate backend service in MVP phase. API routes live in Next.js. Workers for ingestion/scoring can be split out later.

### Database
- **PostgreSQL via Supabase** — Managed Postgres with pgvector support built-in. Supabase also provides S3-compatible storage and optional auth, keeping MVP infrastructure consolidated.
- **Prisma ORM** — Type-safe database access with migrations and a powerful query API. Well-suited for the relational data model described in the PRD.

### Search
- **PostgreSQL full-text search** (initially). The PRD recommends this for MVP to avoid premature infrastructure. Can migrate to OpenSearch later if needed.

### Vector Search
- **pgvector** — Included with Supabase Postgres. Enables semantic search without a separate vector database.

### Authentication
- **Deferred to post-MVP** — Per user request, no authentication in initial build. Pages are publicly accessible. Role-based routes (admin) are present in the schema but not enforced via auth middleware yet.

### Object Storage
- **Supabase Storage** (S3-compatible) — Keeps infrastructure consolidated. Raw documents, archived payloads, and generated reports stored here.

### Job Queue
- **Deferred** — Background jobs for ingestion, extraction, scoring, and alerts will use a Redis-backed queue. Not yet implemented; connectors and workers are stubbed.

### Email
- **Deferred** — Transactional email for daily digests and alerts will use a provider like Resend or SendGrid. Not yet configured.

## Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Nx monorepo | Powerful caching & graph | Heavier setup, more config | Overkill for current team size |
| Separate FastAPI backend | Python ecosystem for ML/AI | Increases infra complexity for MVP | Revisit when AI extraction workers mature |
| PlanetScale / Neon | Serverless Postgres | No pgvector (PlanetScale); newer product | Supabase has built-in pgvector + S3 storage |
| Drizzle ORM | Lightweight, fast | Smaller ecosystem, fewer integrations | Prisma has broader adoption and tooling |
| standalone Next.js | Simpler for one dev | No sharing of types, UI, config | Monorepo enables cleaner separation |

## Consequences

- **Positive:** Single `pnpm dev` command runs the entire app. Shared packages for types, UI, and config ensure consistency.
- **Positive:** Supabase consolidates Postgres + pgvector + Storage into one managed service.
- **Negative:** Without auth, we cannot personalize feeds or enforce admin roles. These routes exist but are unprotected.
- **Negative:** pgvector query performance at scale is unknown; may need OpenSearch migration if semantic search volume grows.
- **Risk:** Prisma has known performance limitations with very large datasets. The data model is relational and well-suited to Prisma, but we should monitor query performance.
