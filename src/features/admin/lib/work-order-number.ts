/** Build the monthly-sequenced work order number, e.g. WO-202606-007. */
export function buildWorkOrderNumber(sequence: number): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `WO-${yyyymm}-${String(sequence).padStart(3, '0')}`;
}
