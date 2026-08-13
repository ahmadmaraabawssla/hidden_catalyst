import { prisma } from '@hidden-catalyst/db';
import { SECEdgarConnector } from './sec-edgar';
import { FederalContractsConnector } from './federal-contracts';
import { FDAConnector, ClinicalTrialsConnector } from './fda';
import { USPTOConnector } from './uspto';
import type { BaseConnector, IngestionResult } from './base';

export function getConnectorRegistry(): BaseConnector[] {
  return [
    new SECEdgarConnector(prisma),
    new FederalContractsConnector(prisma),
    new FDAConnector(prisma),
    new ClinicalTrialsConnector(prisma),
    new USPTOConnector(prisma),
  ];
}

export async function runAllConnectors(): Promise<Record<string, IngestionResult>> {
  const connectors = getConnectorRegistry();
  const results: Record<string, IngestionResult> = {};

  for (const connector of connectors) {
    console.log(`Running connector: ${connector.config.name}...`);
    try {
      results[connector.config.sourceId] = await connector.run();
      const result = results[connector.config.sourceId]!;
      console.log(`[connector] source=${connector.config.sourceId} status=${result.status} fetched=${result.documentsFetched} added=${result.documentsNew} duplicates=${result.duplicates} errors=${result.errors.length} durationMs=${result.durationMs ?? 0}`);
    } catch (err) {
      console.error(`  ✗ ${connector.config.name}: ${(err as Error).message}`);
      results[connector.config.sourceId] = {
        sourceId: connector.config.sourceId,
        status: 'failed',
        documentsFetched: 0,
        documentsNew: 0,
        duplicates: 0,
        candidatesCreated: 0,
        errors: [(err as Error).message],
        durationMs: 0,
      };
    }
  }

  return results;
}

// CLI entry point
if (require.main === module) {
  runAllConnectors()
    .then((results) => {
      console.log('\nAll connectors finished:');
      for (const [id, result] of Object.entries(results)) {
        console.log(`  ${id}: ${result.status} (${result.documentsNew} new, ${result.duplicates} dupes)`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
