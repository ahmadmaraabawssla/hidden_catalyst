// SAM.gov Federal Contracts — Real API Connector
// Free registration: https://sam.gov/content/api
// API docs: https://open.gsa.gov/api/sam-entity-extracts-api/

const SAM_API_BASE = 'https://api.sam.gov/entity-information/v3/entities';
let SAM_API_KEY = process.env.SAM_API_KEY || '';

export class SAMgovConnector {
  static setApiKey(key: string) { SAM_API_KEY = key; }

  /**
   * Search for federal contract opportunities by NAICS code, keyword, or agency.
   * Free tier: 1,000 requests/day.
   */
  static async searchContracts(params: {
    keyword?: string;
    naicsCode?: string;
    agency?: string;
    daysBack?: number;
    limit?: number;
  }) {
    if (!SAM_API_KEY) return [];

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (params.daysBack || 30));

    const url = new URL(SAM_API_BASE);
    url.searchParams.set('api_key', SAM_API_KEY);
    url.searchParams.set('active', 'true');
    url.searchParams.set('lastUpdatedFrom', fromDate.toISOString().slice(0, 10));
    url.searchParams.set('lastUpdatedTo', new Date().toISOString().slice(0, 10));
    url.searchParams.set('size', String(params.limit || 50));

    if (params.keyword) url.searchParams.set('q', params.keyword);
    if (params.naicsCode) url.searchParams.set('naicsCode', params.naicsCode);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return (data._embedded || []).map((e: any) => ({
        entityId: e.entityRegistration?.ueiSAM || e.entityRegistration?.dunsNumber,
        name: e.entityRegistration?.legalBusinessName,
        cageCode: e.entityRegistration?.cageCode,
        naicsCodes: e.coreData?.naicsCodes || [],
        lastUpdated: e.entityRegistration?.lastUpdatedDate,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get active federal contracts and modifications.
   * Note: Full contract data requires SAM.gov Opportunities API (separate registration).
   * For now, this returns company registration data which indicates active federal contractors.
   */
  static async getActiveContractors(limit = 100) {
    return SAMgovConnector.searchContracts({ limit });
  }
}

/**
 * Registration instructions:
 * 1. Go to https://sam.gov/content/api
 * 2. Click "Sign In" → Create account
 * 3. Request API key under "My Account" → "API Keys"
 * 4. Add to .env: SAM_API_KEY=your_key_here
 * 
 * The free tier allows 1,000 requests/day — sufficient for daily scans
 * of new federal contractor registrations and updates.
 */
