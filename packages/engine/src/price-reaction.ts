export interface PricePoint {
  date: string;
  close: number;
  volume?: number | null;
}

export interface PriceReactionResult {
  eventDate: string;
  returns: Record<'t20' | 't5' | 't1' | 'eventDay' | 'p1' | 'p5' | 'p20', number | null>;
  volumeVsBaseline: number | null;
  marketAdjustedReturn: number | null;
  sectorAdjustedReturn: number | null;
  marketReaction: 'minimal' | 'moderate' | 'strong' | 'unknown';
  pricedInScore: number;
}

function byDateAsc(a: PricePoint, b: PricePoint) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

function ret(from?: PricePoint, to?: PricePoint): number | null {
  if (!from?.close || !to?.close) return null;
  return ((to.close - from.close) / from.close) * 100;
}

function nearestIndex(points: PricePoint[], eventDate: Date) {
  let best = -1;
  let bestDiff = Infinity;
  points.forEach((point, idx) => {
    const diff = Math.abs(new Date(point.date).getTime() - eventDate.getTime());
    if (diff < bestDiff) {
      best = idx;
      bestDiff = diff;
    }
  });
  return best;
}

export function calculatePriceReactionWindows(
  prices: PricePoint[],
  eventDate: Date,
  marketReturn?: number | null,
  sectorReturn?: number | null
): PriceReactionResult {
  const ordered = [...prices].filter((p) => p.close > 0).sort(byDateAsc);
  const idx = nearestIndex(ordered, eventDate);

  const point = (offset: number) => ordered[idx + offset];
  const eventDay = ret(point(-1), point(0));
  const p5 = ret(point(0), point(5));
  const absEvent = eventDay == null ? null : Math.abs(eventDay);
  const marketReaction = absEvent == null ? 'unknown' : absEvent < 1 ? 'minimal' : absEvent < 5 ? 'moderate' : 'strong';

  const baseline = ordered.slice(Math.max(0, idx - 20), Math.max(0, idx - 1));
  const avgVolume = baseline.length
    ? baseline.reduce((sum, p) => sum + Number(p.volume || 0), 0) / baseline.length
    : 0;
  const volumeVsBaseline = avgVolume > 0 && point(0)?.volume ? Number(point(0)?.volume) / avgVolume : null;

  const pricedInScore =
    marketReaction === 'unknown' ? 50 :
    marketReaction === 'minimal' ? 90 :
    marketReaction === 'moderate' ? 55 :
    20;

  return {
    eventDate: eventDate.toISOString().slice(0, 10),
    returns: {
      t20: ret(point(-20), point(0)),
      t5: ret(point(-5), point(0)),
      t1: ret(point(-1), point(0)),
      eventDay,
      p1: ret(point(0), point(1)),
      p5,
      p20: ret(point(0), point(20)),
    },
    volumeVsBaseline,
    marketAdjustedReturn: eventDay != null && marketReturn != null ? eventDay - marketReturn : null,
    sectorAdjustedReturn: eventDay != null && sectorReturn != null ? eventDay - sectorReturn : null,
    marketReaction,
    pricedInScore,
  };
}
