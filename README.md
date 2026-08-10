# Hidden Catalyst Discovery Platform

Evidence-first public-market intelligence for underfollowed U.S.-listed companies.

> **Status:** Production-Ready — Full pipeline with real-time SEC ingestion, FMP market data, and auto-scoring.

## What is Hidden Catalyst?

Hidden Catalyst identifies public developments connected to underfollowed public companies, evaluates whether those developments may be financially material, measures how widely the information is already known, and presents a source-linked opportunity report with risks, assumptions, and invalidation conditions.

**It is not** a trading bot, stock-price predictor, or brokerage product.

## Tech Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Frontend       | Next.js 14 (App Router), TypeScript |
| Styling        | Tailwind CSS                        |
| Backend API    | Next.js API Routes                  |
| Database       | PostgreSQL (Supabase)               |
| ORM            | Prisma                              |
| Vector Search  | pgvector                            |
| Object Storage | Supabase Storage (S3-compatible)    |
| Monorepo       | pnpm workspaces + Turborepo         |

## Project Structure

```
hidden-catalyst/
├── apps/
│   └── web/                    # Next.js website + API
│       └── src/
│           └── app/
│               ├── feed/                   # Opportunity feed
│               ├── opportunities/[id]/     # Opportunity detail
│               ├── companies/[ticker]/     # Company profile
│               ├── search/                 # Global search
│               ├── watchlists/             # User watchlists
│               ├── methodology/            # Scoring methodology
│               └── settings/               # User settings
├── packages/
│   ├── db/           # Prisma schema, migrations, seed
│   ├── domain/       # Shared types, score formulas, validation
│   ├── ui/           # Reusable UI components
│   ├── config/       # App configuration & feature flags
│   └── tsconfig/     # Shared TypeScript configs
├── docs/
│   ├── adr-001-monorepo-stack.md
│   └── Hidden_Catalyst_Website_Build_PRD.docx
└── .env.example
```

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Supabase** account (free tier works)

### 1. Clone & install

```bash
git clone <repo-url>
cd hidden-catalyst
pnpm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Project Settings > Database > Connection string**
3. Copy the **URI** connection string
4. In **SQL Editor**, enable pgvector:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and paste your Supabase connection string:
```
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Seed the database

```bash
pnpm db:seed
```

This creates 5 sources, 5 companies, and 6 sample opportunities including:
- Government contract modification (score 78)
- FDA Fast Track designation (score 72)
- Environmental permit approval (score 81)
- Patent grant (needs review, score 65)
- Clinical trial results (score 86)
- An invalidated opportunity (demo of invalidation flow)

### 6. Start development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Routes

| Route                          | Page                  |
| ------------------------------ | --------------------- |
| `/`                            | Marketing landing     |
| `/feed`                        | Opportunity feed      |
| `/opportunities/[id]`          | Opportunity detail    |
| `/companies/[ticker]`          | Company profile       |
| `/search`                      | Global search         |
| `/watchlists`                  | Watchlists            |
| `/methodology`                 | Scoring methodology   |
| `/settings`                    | User settings         |

## Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `pnpm dev`           | Start all apps in development mode   |
| `pnpm build`         | Build all apps and packages          |
| `pnpm lint`          | Run linting across the monorepo      |
| `pnpm typecheck`     | Type-check all packages              |
| `pnpm db:generate`   | Generate Prisma client               |
| `pnpm db:migrate`    | Run database migrations              |
| `pnpm db:seed`       | Seed the database with sample data   |
| `pnpm db:studio`     | Open Prisma Studio (DB GUI)          |

## Product Principles

1. **Evidence before narrative** — Every opportunity links to stored evidence items.
2. **Separate fact from inference** — UI labels distinguish verified fact, inference, estimate, assumption, and unconfirmed signal.
3. **Obscurity is not quality** — Low attention can increase asymmetry but cannot compensate for weak evidence.
4. **Explainable scoring** — Every score shows factors, weights, inputs, and confidence. No opaque "AI score."
5. **Human review for risky cases** — Micro-cap, legal allegation, and rumor cases require manual approval.
6. **No direction guarantee** — The product describes catalysts and scenarios, not guaranteed outcomes.

## License

Proprietary. All rights reserved.
