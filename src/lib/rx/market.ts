/**
 * Phase-1 dispensing markets. Rx eyewear may only be dispensed to the US and
 * Canada — the UK requires optician supervision we don't yet have (Opticians
 * Act 1989). Sunglasses-only UK sales are out of this gate's scope.
 */
export const DISPENSABLE_COUNTRIES = ['us', 'ca'];

/**
 * Resolve the SHIP-TO country for a dispensing decision and test it against the
 * allowed markets. Gating on the destination (not billing) prevents a US-billed
 * customer from shipping an Rx pair to a non-dispensable country. A blank/absent
 * shipping country_code falls back to billing country, which is itself
 * constrained to US/CA at the database layer.
 */
export function isDispensableDestination(
  shippingAddress: { country_code?: string } | null | undefined,
  billingCountry: string | null | undefined,
): boolean {
  const shipCode = shippingAddress?.country_code?.trim();
  const destination = shipCode ? shipCode : billingCountry;
  return !!destination && DISPENSABLE_COUNTRIES.includes(destination.trim().toLowerCase());
}
