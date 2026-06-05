export interface ProRataInput {
  capturedAmount: number;   // actual amount captured by Shopify, this currency
  pairsTotal: number;       // frozen pairs_total on the membership
  uncommittedCount: number; // slots in {available, locked}
}

/** Pro-rata refund for unredeemed pairs. Floors at 0, caps at capturedAmount,
 *  rounds DOWN to cents so we never over-refund. */
export function computeProRataRefund({ capturedAmount, pairsTotal, uncommittedCount }: ProRataInput): number {
  if (capturedAmount <= 0 || pairsTotal <= 0 || uncommittedCount <= 0) return 0;
  const fraction = Math.min(uncommittedCount, pairsTotal) / pairsTotal;
  const raw = capturedAmount * fraction;
  const floored = Math.floor(raw * 100) / 100;
  return Math.min(floored, capturedAmount);
}
