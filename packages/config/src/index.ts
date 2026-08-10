export { env } from './env';

export const appConfig = {
  name: 'Hidden Catalyst Discovery Platform',
  description:
    'Evidence-first public-market intelligence for underfollowed U.S.-listed companies.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  environment: process.env.NODE_ENV || 'development',
} as const;

export const universe = {
  exchanges: ['NYSE', 'NASDAQ', 'NYSE American'] as const,
  marketCap: {
    min: 100_000_000,
    max: 10_000_000_000,
    defaultMin: 200_000_000,
    defaultMax: 5_000_000_000,
  },
  minAvgDollarVolume: 1_000_000,
} as const;

export const features = {
  auth: false, // No auth for initial MVP
  aiExtraction: false,
  alerts: false,
  search: true,
} as const;
