/**
 * Connector framework for Hidden Catalyst.
 *
 * Each connector:
 * 1. Fetches raw data from a public source
 * 2. Normalizes into Document records
 * 3. Extracts entities, events, and evidence
 * 4. Creates candidate opportunities
 */

import type { PrismaClient } from '@hidden-catalyst/db';

export interface ConnectorConfig {
  sourceId: string;
  name: string;
  family: string;
  schedule: string; // cron expression
  rateLimitPerMinute: number;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export interface RawDocument {
  canonicalUrl: string;
  title: string;
  text: string;
  publishedAt: Date;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface ExtractionResult {
  entities: {
    name: string;
    type: string;
    attributes?: Record<string, unknown>;
  }[];
  events: {
    eventType: string;
    title: string;
    occurredAt?: Date;
    expectedAt?: Date;
    primaryEntityName?: string;
    attributes?: Record<string, unknown>;
  }[];
  relationships: {
    fromEntityName: string;
    toEntityName: string;
    relationshipType: string;
    confidence: number;
  }[];
  claims: {
    claimType: string;
    text: string;
    confidence?: number;
    excerpt: string;
  }[];
}

export interface IngestionResult {
  sourceId: string;
  status: 'completed' | 'partial' | 'failed';
  documentsFetched: number;
  documentsNew: number;
  duplicates: number;
  candidatesCreated: number;
  errors: string[];
  cursor?: string;
}

/**
 * Base connector class. Implement `fetchDocuments` and `extract` per source.
 */
export abstract class BaseConnector {
  constructor(
    protected prisma: PrismaClient,
    public config: ConnectorConfig
  ) {}

  abstract fetchDocuments(since?: Date): Promise<RawDocument[]>;
  abstract extract(document: RawDocument): Promise<ExtractionResult>;

  async run(): Promise<IngestionResult> {
    const runId = await this.startRun();
    const result: IngestionResult = {
      sourceId: this.config.sourceId,
      status: 'completed',
      documentsFetched: 0,
      documentsNew: 0,
      duplicates: 0,
      candidatesCreated: 0,
      errors: [],
    };

    try {
      const rawDocs = await this.fetchDocuments();
      result.documentsFetched = rawDocs.length;

      for (const raw of rawDocs) {
        try {
          const contentHash = await this.hashContent(raw.text + raw.canonicalUrl);

          // Check for duplicate
          const existing = await this.prisma.document.findUnique({
            where: { contentHash },
          });

          if (existing) {
            result.duplicates++;
            continue;
          }

          // Store document
          const doc = await this.prisma.document.create({
            data: {
              sourceId: this.config.sourceId,
              canonicalUrl: raw.canonicalUrl,
              title: raw.title,
              text: raw.text,
              publishedAt: raw.publishedAt,
              retrievedAt: new Date(),
              contentHash,
              language: raw.language || 'en',
              parserVersion: '1.0.0',
            },
          });

          result.documentsNew++;

          // Extract structured data
          const extracted = await this.extract(raw);

          // Store evidence items
          for (const claim of extracted.claims) {
            await this.prisma.evidenceItem.create({
              data: {
                documentId: doc.id,
                excerpt: claim.excerpt,
                evidenceType: 'primary',
                qualityScore: 85,
              },
            });
          }

          // Resolve/create entities
          for (const ent of extracted.entities) {
            await this.prisma.entity.upsert({
              where: { id: `entity_${this.slugify(ent.name)}` },
              update: { attributes: (ent.attributes || {}) as any },
              create: {
                id: `entity_${this.slugify(ent.name)}`,
                entityType: ent.type,
                canonicalName: ent.name,
                attributes: (ent.attributes || {}) as any,
              },
            });
          }

          // Store events
          for (const evt of extracted.events) {
            await this.prisma.event.create({
              data: {
                eventType: evt.eventType,
                title: evt.title,
                occurredAt: evt.occurredAt,
                expectedAt: evt.expectedAt,
                primaryEntityId: evt.primaryEntityName
                  ? `entity_${this.slugify(evt.primaryEntityName)}`
                  : undefined,
                attributes: (evt.attributes || {}) as any,
              },
            });
          }

        } catch (err) {
          result.errors.push(`Document error: ${(err as Error).message}`);
        }
      }

      await this.completeRun(runId, result);
    } catch (err) {
      result.status = 'failed';
      result.errors.push(`Connector error: ${(err as Error).message}`);
      await this.failRun(runId, result);
    }

    return result;
  }

  private async hashContent(content: string): Promise<string> {
    // Simple hash for MVP — use crypto in production
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `sha256_${Math.abs(hash).toString(16)}`;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50);
  }

  private async startRun(): Promise<string> {
    const run = await this.prisma.ingestionRun.create({
      data: { sourceId: this.config.sourceId, status: 'running' },
    });
    return run.id;
  }

  private async completeRun(runId: string, result: IngestionResult) {
    await this.prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        countsJson: {
          fetched: result.documentsFetched,
          new: result.documentsNew,
          duplicates: result.duplicates,
          candidates: result.candidatesCreated,
        },
      },
    });
  }

  private async failRun(runId: string, result: IngestionResult) {
    await this.prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorJson: { errors: result.errors },
        countsJson: {
          fetched: result.documentsFetched,
          new: result.documentsNew,
        },
      },
    });
  }
}
