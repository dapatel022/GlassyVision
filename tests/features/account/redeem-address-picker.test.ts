import { describe, it, expect } from 'vitest';
import {
  savedAddressToShipTo,
  type RedeemSavedAddress,
} from '@/app/(site)/account/subscription/redeem/[slotId]/ship-to';

const SAVED: RedeemSavedAddress = {
  id: 'addr-1',
  label: 'Home',
  recipientName: 'Dana Doe',
  address: {
    address1: '1 Main St',
    address2: 'Apt 4',
    city: 'New York',
    province: 'NY',
    zip: '10001',
    country_code: 'US',
  },
};

describe('savedAddressToShipTo', () => {
  it('maps a saved address to the redeem ship_to shape', () => {
    expect(savedAddressToShipTo(SAVED)).toEqual({
      name: 'Dana Doe',
      address1: '1 Main St',
      address2: 'Apt 4',
      city: 'New York',
      province: 'NY',
      zip: '10001',
      country_code: 'US',
    });
  });

  it('fills missing fields with empty strings and defaults country to US', () => {
    const partial: RedeemSavedAddress = {
      id: 'addr-2',
      label: null,
      recipientName: 'No Address',
      address: {},
    };
    expect(savedAddressToShipTo(partial)).toEqual({
      name: 'No Address',
      address1: '',
      address2: '',
      city: '',
      province: '',
      zip: '',
      country_code: 'US',
    });
  });

  it('produces a ship_to passable unchanged to startRedemption', () => {
    // The redeem form sends this object straight through as `shipTo`. The
    // country_code is what the market gate reads, so it must survive intact.
    const shipTo = savedAddressToShipTo(SAVED);
    expect(shipTo.country_code).toBe('US');
    expect(Object.keys(shipTo).sort()).toEqual(
      ['address1', 'address2', 'city', 'country_code', 'name', 'province', 'zip'].sort(),
    );
  });
});
