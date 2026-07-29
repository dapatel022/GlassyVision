// Shared between the ShippingQueue UI and the createShipment server action so
// the server validates against the same list the form offers.
export const CARRIERS = ['DHL', 'FedEx', 'Shiprocket', 'India Post', 'Aramex'] as const;
