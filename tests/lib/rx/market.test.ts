import { describe, it, expect } from 'vitest';
import { isDispensableDestination } from '@/lib/rx/market';

describe('isDispensableDestination', () => {
  it('allows a US shipping destination', () => {
    expect(isDispensableDestination({ country_code: 'US' }, 'us')).toBe(true);
  });

  it('allows a Canadian shipping destination', () => {
    expect(isDispensableDestination({ country_code: 'CA' }, 'us')).toBe(true);
  });

  it('blocks a non-US/CA shipping destination even when billing is US', () => {
    expect(isDispensableDestination({ country_code: 'GB' }, 'us')).toBe(false);
  });

  it('falls back to billing country when there is no shipping address', () => {
    expect(isDispensableDestination(null, 'us')).toBe(true);
    expect(isDispensableDestination(undefined, 'ca')).toBe(true);
  });

  it('falls back to billing country when shipping country_code is blank', () => {
    expect(isDispensableDestination({ country_code: '' }, 'us')).toBe(true);
    expect(isDispensableDestination({ country_code: '   ' }, 'us')).toBe(true);
  });

  it('does NOT fall back to billing when a shipping destination is explicitly non-dispensable', () => {
    // A GB ship-to with US billing must be blocked, not rescued by billing.
    expect(isDispensableDestination({ country_code: 'GB' }, 'us')).toBe(false);
  });

  it('allows a whitespace-padded valid country code', () => {
    expect(isDispensableDestination({ country_code: ' US ' }, null)).toBe(true);
  });

  it('blocks when neither destination is known', () => {
    expect(isDispensableDestination(null, null)).toBe(false);
    expect(isDispensableDestination({ country_code: '' }, null)).toBe(false);
  });
});
