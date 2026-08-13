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
import type { NormalizedSignal } from '@hidden-catalyst/domain';
import { createHash } from 'node:crypto';

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
  signals?: NormalizedSignal[];
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
  durationMs?: number;
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
    const startedAt = Date.now();
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
      const rawDocs = await this.withRetry(() => this.fetchDocuments());
      result.documentsFetched = rawDocs.length;

      for (const raw of rawDocs) {
        try {
          const contentHash = await this.hashContent(raw.text + raw.canonicalUrl);

          // Check for duplicate
          const existing = await this.prisma.document.findFirst({
            where: {
              OR: [
                { contentHash },
                { canonicalUrl: raw.canonicalUrl, publishedAt: raw.publishedAt },
              ],
            },
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

          for (const signal of extracted.signals || []) {
            const priority = this.calculateSignalPriority(signal);
            await this.prisma.signal.upsert({
              where: {
                sourceId_externalId: {
                  sourceId: this.config.sourceId,
                  externalId: signal.externalId || signal.sourceUrl,
                },
              },
              update: {
                title: signal.title,
                rawText: signal.rawText,
                entities: signal.entities as any,
                eventType: signal.eventType,
                amounts: signal.amounts as any,
                dates: signal.dates as any,
                locations: signal.locations as any,
                sourceQuality: signal.sourceQuality,
                rawMetadata: signal.rawMetadata as any,
                triageScore: priority.score,
                triageFactors: priority.factors as any,
                triagedAt: new Date(),
                documentId: doc.id,
              },
              create: {
                sourceId: this.config.sourceId,
                documentId: doc.id,
                sourceType: signal.sourceType,
                externalId: signal.externalId || signal.sourceUrl,
                publishedAt: signal.publishedAt,
                retrievedAt: signal.retrievedAt,
                title: signal.title,
                rawText: signal.rawText,
                entities: signal.entities as any,
                eventType: signal.eventType,
                amounts: signal.amounts as any,
                dates: signal.dates as any,
                locations: signal.locations as any,
                sourceUrl: signal.sourceUrl,
                sourceQuality: signal.sourceQuality,
                rawMetadata: signal.rawMetadata as any,
                triageScore: priority.score,
                triageFactors: priority.factors as any,
                triagedAt: new Date(),
              },
            });
          }

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

      if (result.errors.length > 0) result.status = 'partial';
      result.durationMs = Date.now() - startedAt;
      await this.completeRun(runId, result);
    } catch (err) {
      result.status = 'failed';
      result.errors.push(`Connector error: ${(err as Error).message}`);
      result.durationMs = Date.now() - startedAt;
      await this.failRun(runId, result);
    }

    return result;
  }

  private async hashContent(content: string): Promise<string> {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50);
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.retryPolicy.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.retryPolicy.maxAttempts) {
          const delayMs = Math.min(this.config.retryPolicy.backoffMs * attempt, 30_000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError || new Error(`${this.config.name} failed after retries`);
  }

  private calculateSignalPriority(signal: NormalizedSignal): { score: number; factors: Record<string, number> } {
    const largestAmount = Math.max(0, ...signal.amounts.map((amount) => amount.value || 0));
    const daysOld = Math.max(0, Math.round((Date.now() - signal.publishedAt.getTime()) / 86400000));
    const eventTypeScore = /award|approval|clearance|trial|patent|merger|contract/i.test(String(signal.eventType || '')) ? 85 : 45;
    const amountScore = largestAmount >= 100_000_000 ? 95 : largestAmount >= 10_000_000 ? 75 : largestAmount > 0 ? 50 : 20;
    const recencyScore = daysOld <= 1 ? 95 : daysOld <= 7 ? 70 : daysOld <= 30 ? 45 : 20;
    const entityScore = signal.entities.length > 1 ? 70 : signal.entities.length === 1 ? 50 : 20;
    const score = Math.round(
      signal.sourceQuality * 0.25 +
      eventTypeScore * 0.25 +
      amountScore * 0.25 +
      recencyScore * 0.15 +
      entityScore * 0.10
    );

    return {
      score: Math.max(1, Math.min(100, score)),
      factors: { sourceQuality: signal.sourceQuality, eventTypeScore, amountScore, recencyScore, entityScore },
    };
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
        status: result.status,
        completedAt: new Date(),
        countsJson: {
          fetched: result.documentsFetched,
          new: result.documentsNew,
          duplicates: result.duplicates,
          candidates: result.candidatesCreated,
          errors: result.errors.length,
          durationMs: result.durationMs,
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
