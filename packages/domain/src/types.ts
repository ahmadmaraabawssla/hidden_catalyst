// Opportunity status lifecycle
export type OpportunityStatus =
  | 'candidate'
  | 'needs_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived'
  | 'invalidated';

export type QualificationStatus =
  | 'reject'
  | 'watch'
  | 'candidate'
  | 'verified';

// Claim types for separating fact from inference
export type ClaimType =
  | 'verified_fact'
  | 'inference'
  | 'estimate'
  | 'assumption'
  | 'unconfirmed_signal';

// Score categories
export type ScoreType =
  | 'research_priority'
  | 'company_attention'
  | 'catalyst_attention'
  | 'information_asymmetry'
  | 'catalyst_strength'
  | 'evidence_quality'
  | 'financial_materiality'
  | 'timing'
  | 'price_reaction'
  | 'risk'
  | 'relationship_confidence'
  | 'research_confidence'
  | 'research_completeness'
  | 'opportunity';

// Catalyst categories
export type CatalystType =
  | 'contract_solicitation'
  | 'contract_award'
  | 'contract_modification'
  | 'regulatory_approval'
  | 'regulatory_decision'
  | 'patent_grant'
  | 'clinical_trial_result'
  | 'merger_acquisition'
  | 'supplier_relationship'
  | 'customer_relationship'
  | 'executive_change'
  | 'earnings_surprise'
  | 'product_launch'
  | 'facility_expansion'
  | 'legal_development'
  | 'other';

export type SignalSourceFamily =
  | 'sec_edgar'
  | 'sam_gov'
  | 'usaspending'
  | 'fda'
  | 'clinicaltrials'
  | 'uspto'
  | 'grants_gov'
  | 'market_data'
  | 'news'
  | 'company_ir'
  | 'other';

export interface NormalizedSignal {
  signalId?: string;
  source: SignalSourceFamily;
  sourceType: SourceType | string;
  externalId?: string;
  publishedAt: Date;
  retrievedAt: Date;
  title: string;
  rawText: string;
  entities: Array<{
    name: string;
    type: EntityType | string;
    identifiers?: Record<string, string>;
    confidence?: number;
  }>;
  eventType?: CatalystType | string;
  amounts: Array<{
    value: number;
    currency?: string;
    label?: string;
    confidence?: number;
  }>;
  dates: Array<{
    value: string;
    label?: string;
    confidence?: number;
  }>;
  locations: Array<{
    value: string;
    type?: string;
    confidence?: number;
  }>;
  sourceUrl: string;
  sourceQuality: number;
  rawMetadata: Record<string, unknown>;
}

export interface CatalystClusterResearch {
  researchQuestions: string[];
  materiality?: Record<string, unknown>;
  attention?: Record<string, unknown>;
  priceReaction?: Record<string, unknown>;
  adversarialFindings?: Record<string, unknown>;
  historicalComparables?: Record<string, unknown>;
  researchCompleteness: number;
  researchConfidence: number;
}

// Entity types for the knowledge graph
export type EntityType =
  | 'company'
  | 'person'
  | 'agency'
  | 'product'
  | 'facility'
  | 'patent'
  | 'contract'
  | 'trial'
  | 'other';

// Relationship types
export type RelationshipType =
  | 'supplier_of'
  | 'customer_of'
  | 'competitor_of'
  | 'partner_of'
  | 'subsidiary_of'
  | 'awarded_to'
  | 'regulated_by'
  | 'cited_by'
  | 'references';

// Evidence source types
export type SourceType =
  | 'sec_filing'
  | 'press_release'
  | 'federal_contract'
  | 'fda_document'
  | 'clinical_trial'
  | 'patent_grant'
  | 'regulatory_permit'
  | 'earnings_transcript'
  | 'market_data'
  | 'news_article'
  | 'other';

// Risk types
export type RiskType =
  | 'low_liquidity'
  | 'dilution_risk'
  | 'binary_outcome'
  | 'legal_uncertainty'
  | 'customer_concentration'
  | 'promotional_source'
  | 'stale_evidence'
  | 'weak_mapping'
  | 'financing_need'
  | 'micro_cap';

// User roles
export type UserRole = 'user' | 'analyst' | 'admin';

// Evidence quality tier
export type EvidenceQualityTier = 'primary' | 'secondary' | 'tertiary';

// Source accessibility
export type SourceAccessibility =
  | 'public_free'
  | 'public_licensed'
  | 'unavailable'
  | 'archived'
  | 'manual_entry';
