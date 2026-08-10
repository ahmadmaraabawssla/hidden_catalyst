/**
 * Centralized environment configuration.
 * ALL secrets and credentials are read from environment variables ONLY.
 * No hardcoded values.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string = ''): string {
  return process.env[key] || fallback;
}

export const env = {
  // Database
  DATABASE_URL: () => requireEnv('DATABASE_URL'),

  // DeepSeek AI (optional — pipeline requires it)
  DEEPSEEK_API_KEY: () => process.env.DEEPSEEK_API_KEY || '',

  // Finnhub Market Data (free tier)
  FINNHUB_API_KEY: () => process.env.FINNHUB_API_KEY || '',

  // SAM.gov Federal Contracts (free tier — requires registration)
  SAM_API_KEY: () => process.env.SAM_API_KEY || '',

  // SEC EDGAR User-Agent (required by SEC)
  SEC_USER_AGENT: () => optionalEnv('SEC_USER_AGENT', 'Hidden Catalyst Research (contact@hiddencatalyst.com)'),

  // App
  NEXT_PUBLIC_APP_URL: () => optionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  NODE_ENV: () => optionalEnv('NODE_ENV', 'development'),
} as const;
