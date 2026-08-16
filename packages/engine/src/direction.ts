/**
 * Catalyst direction — the economic sign of a catalyst, independent of whether
 * it is "interesting" or "material".
 *
 * This is the missing dimension the reviewer identified: a discovery can be
 * highly material, underfollowed, and well-supported while being a NEGATIVE
 * catalyst (e.g. a settlement default + warrants + dilution on a fragile
 * micro-cap). "Promising" is the wrong word for that — it is a risk thesis.
 *
 * Positive = potentially beneficial to equity value.
 * Negative = potentially harmful to equity value.
 * Mixed    = meaningful positive AND negative mechanisms.
 * Unclear  = important development, direction unresolved.
 */
export type CatalystDirection = 'positive' | 'negative' | 'mixed' | 'unclear';

const NEGATIVE_TYPE = /liability|true.?up|warrant|dilution|financing|default|deficiency|reverse.?split|delist|insolvency|bankrupt|going.?concern|impairment|charge|write.?off|recall|litigation|lawsuit|subpoena|investigation|restatement|foreclosure|acceleration/;
const NEGATIVE_TEXT = /default liability|settlement default|true.?up|commitment fee price|pre.?funded warrant|reverse split|deficiency notice|delist|going concern|impairment|charge|write.?off|recall|lawsuit|litigation|subpoena|investigation|default under|acceleration|foreclosure|bankrupt|insolven|dilut|convertible into|overhang|may settle in shares/;

const POSITIVE_TYPE = /contract_award|award|grant|approval|patent|clearance|designation|partnership|expansion|customer|backlog|order|acquisition/;
const POSITIVE_TEXT = /award|contract|grant|approval|patent|clearance|designation|partnership|expansion|customer win|new order|backlog|buyback|dividend|acquisition|positive|superior|completed|primary endpoint|approved/;

/**
 * Deterministically infer the economic sign of a catalyst from its event type
 * and text. This is deliberately conservative: when both positive and negative
 * signals are present it returns 'mixed', and when neither is clearly present
 * it returns 'unclear'. It never pretends to know a direction it can't derive.
 */
export function inferDirection(eventType: string | null | undefined, text: string | null | undefined): CatalystDirection {
  const t = (eventType || '').toLowerCase();
  const txt = (text || '').toLowerCase();

  const negative = NEGATIVE_TYPE.test(t) || NEGATIVE_TEXT.test(txt);
  const positive = POSITIVE_TYPE.test(t) || POSITIVE_TEXT.test(txt);

  if (negative && positive) return 'mixed';
  if (negative) return 'negative';
  if (positive) return 'positive';
  return 'unclear';
}
