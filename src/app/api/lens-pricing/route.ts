import { NextResponse } from 'next/server';
import { getLensUpgradePricing } from '@/lib/commerce/lens-pricing';

// Public price data for the client-side cart. `pricing: null` means the
// upgrade catalog is unavailable — the cart must fail closed (block checkout
// of lines with paid upgrades), never assume zero cost.
export const revalidate = 300;

export async function GET() {
  const pricing = await getLensUpgradePricing();
  return NextResponse.json({ pricing });
}
