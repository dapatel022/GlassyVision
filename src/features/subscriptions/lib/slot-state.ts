/**
 * Collapse the 12-value redemption_status enum into the 5 visual states the
 * account slot cards render. Unknown / future statuses collapse to 'reserved'
 * so an in-flight slot can never show a redeem CTA by accident.
 */
export type SlotState = 'available' | 'awaiting_rx' | 'in_production' | 'shipped' | 'reserved' | 'expired';

export function deriveSlotState(
  redemption: { status: string },
  membershipStatus: string,
): SlotState {
  switch (redemption.status) {
    case 'available':
      return membershipStatus === 'active' || membershipStatus === 'grace' ? 'available' : 'expired';
    case 'awaiting_rx':
    case 'in_review':
    case 'rx_rejected':
      return 'awaiting_rx';
    case 'awaiting_fulfillment':
    case 'in_production':
      return 'in_production';
    case 'shipped':
    case 'delivered':
      return 'shipped';
    case 'expired':
    case 'cancelled':
      return 'expired';
    default:
      return 'reserved';
  }
}
