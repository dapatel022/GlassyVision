import Link from 'next/link';
import { getMembershipMath, pdpMathLine } from '@/lib/commerce/membership-math';
import { MATH_EXCLUDED_HANDLES } from '@/lib/commerce/membership-math-core';

/**
 * "Or from $X/pair with membership" under the PDP price. Fail closed: math
 * unavailable, non-frame product, or no real saving → renders nothing.
 */
export default async function MembershipMathLine({
  productHandle,
  productPrice,
}: {
  productHandle: string;
  productPrice: number;
}) {
  if ((MATH_EXCLUDED_HANDLES as readonly string[]).includes(productHandle)) return null;
  const math = await getMembershipMath();
  const line = pdpMathLine(math, productPrice);
  if (!line) return null;
  return (
    <p className="mt-2 font-mono text-xs text-muted">
      Or from <strong className="text-accent">${line.perPair}/pair</strong> with membership{' '}
      <Link href="/membership" className="text-accent underline underline-offset-2">
        see how →
      </Link>
    </p>
  );
}
