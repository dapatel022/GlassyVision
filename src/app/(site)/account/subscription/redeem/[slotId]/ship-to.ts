// Shared ship-to shape for the redeem flow + the mapping from a customer's
// saved address into it. Kept as a tiny pure module so the picker logic is
// unit-testable without a DOM and so `startRedemption` keeps receiving the same
// `ship_to` object regardless of whether the customer picked a saved address or
// typed one in.

export interface RedeemShipTo {
  name: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country_code: string;
}

export interface RedeemSavedAddress {
  id: string;
  label: string | null;
  recipientName: string;
  address: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country_code?: string;
  };
}

export function savedAddressToShipTo(saved: RedeemSavedAddress): RedeemShipTo {
  const a = saved.address ?? {};
  return {
    name: saved.recipientName ?? '',
    address1: a.address1 ?? '',
    address2: a.address2 ?? '',
    city: a.city ?? '',
    province: a.province ?? '',
    zip: a.zip ?? '',
    country_code: a.country_code ?? 'US',
  };
}
