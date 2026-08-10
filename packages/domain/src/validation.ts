/**
 * Validation schemas and utilities for the Hidden Catalyst platform.
 */

export const SECURITY_PATTERNS = {
  ticker: /^[A-Z]{1,5}$/,
  cik: /^\d{1,10}$/,
  isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/,
  cusip: /^[A-Z0-9]{9}$/,
};

export const MARKET_CAP_RANGE = {
  min: 100_000_000,   // $100M
  max: 10_000_000_000, // $10B
  defaultMin: 200_000_000,
  defaultMax: 5_000_000_000,
} as const;

export const LIQUIDITY_THRESHOLDS = {
  defaultMinAvgDollarVolume: 1_000_000, // $1M
  microCapMax: 300_000_000,
} as const;

export const VALID_EXCHANGES = [
  'NYSE',
  'NASDAQ',
  'NYSE American',
] as const;

export function isValidTicker(ticker: string): boolean {
  return SECURITY_PATTERNS.ticker.test(ticker);
}

export function validateMarketCap(value: number): boolean {
  return value >= MARKET_CAP_RANGE.min && value <= MARKET_CAP_RANGE.max;
}
