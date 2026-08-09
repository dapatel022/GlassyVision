import { NextResponse } from 'next/server';
import { getMembershipMath } from '@/lib/commerce/membership-math';

// Public price data for the client-side cart nudge. `math: null` means
// savings figures are unavailable — the nudge must render nothing (fail
// closed), never estimate.
export const revalidate = 300;

export async function GET() {
  const math = await getMembershipMath();
  return NextResponse.json({ math });
}
