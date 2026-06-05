import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks --------------------------------------------------------------
const getCurrentCustomer = vi.fn();
vi.mock('@/lib/auth/customer', () => ({
  getCurrentCustomer: () => getCurrentCustomer(),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// --- Helpers ------------------------------------------------------------
// Builds a thenable query chain. Every chained method returns the same object,
// which also resolves (await) to `{ data, error }`. Records calls for assertions.
function makeChain(result: { data: unknown; error: unknown }, calls: Array<[string, unknown[]]>) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve(result);
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return chain;
      };
    },
  };
  const chain: Record<string, unknown> = new Proxy({}, handler);
  return chain;
}

beforeEach(() => {
  getCurrentCustomer.mockReset();
  mockFrom.mockReset();
});

const ADDR = { address1: '1 Main', city: 'NYC', province: 'NY', zip: '10001', country_code: 'US' };

describe('saved-address actions — auth', () => {
  it('addAddress rejects when not signed in', async () => {
    getCurrentCustomer.mockResolvedValue(null);
    const { addAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await addAddress({ recipientName: 'A', address: ADDR });
    expect(res.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deleteAddress rejects when not signed in', async () => {
    getCurrentCustomer.mockResolvedValue(null);
    const { deleteAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await deleteAddress('addr-1');
    expect(res.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('setDefaultAddress rejects when not signed in', async () => {
    getCurrentCustomer.mockResolvedValue(null);
    const { setDefaultAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await setDefaultAddress('addr-1');
    expect(res.error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('saved-address actions — scoping & default handling', () => {
  it('addAddress inserts a row scoped to the current customer', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
    const calls: Array<[string, unknown[]]> = [];
    mockFrom.mockImplementation(() => makeChain({ data: [{ id: 'addr-new' }], error: null }, calls));

    const { addAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await addAddress({ recipientName: 'A', address: ADDR, label: 'Home' });

    expect(res.ok).toBe(true);
    const insertCall = calls.find((c) => c[0] === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toMatchObject({ customer_id: 'cust-1', recipient_name: 'A' });
  });

  it('addAddress with isDefault clears any existing default first', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
    const updateCalls: Array<[string, unknown[]]> = [];
    const insertCalls: Array<[string, unknown[]]> = [];
    mockFrom.mockImplementation(() => ({
      update: (...a: unknown[]) => {
        updateCalls.push(['update', a]);
        return makeChain({ data: null, error: null }, updateCalls);
      },
      insert: (...a: unknown[]) => {
        insertCalls.push(['insert', a]);
        return makeChain({ data: [{ id: 'addr-new' }], error: null }, insertCalls);
      },
    }));

    const { addAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await addAddress({ recipientName: 'A', address: ADDR, isDefault: true });

    expect(res.ok).toBe(true);
    // The clear-existing-default update must have run before the insert.
    expect(updateCalls.find((c) => c[0] === 'update')).toBeDefined();
    const ins = insertCalls.find((c) => c[0] === 'insert');
    expect((ins![1][0] as Record<string, unknown>).is_default).toBe(true);
  });

  it('setDefaultAddress clears existing default then sets the chosen one', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
    const updateCalls: Array<unknown[]> = [];
    mockFrom.mockImplementation(() => ({
      update: (payload: unknown) => {
        updateCalls.push([payload]);
        return makeChain({ data: null, error: null }, []);
      },
    }));

    const { setDefaultAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await setDefaultAddress('addr-2');

    expect(res.ok).toBe(true);
    // Two updates: clear (is_default:false) then set (is_default:true).
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0][0]).toMatchObject({ is_default: false });
    expect(updateCalls[1][0]).toMatchObject({ is_default: true });
  });

  it('deleteAddress scopes the delete to the chosen id', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
    const calls: Array<[string, unknown[]]> = [];
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }, calls));

    const { deleteAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await deleteAddress('addr-1');

    expect(res.ok).toBe(true);
    expect(calls.find((c) => c[0] === 'delete')).toBeDefined();
    const eqCall = calls.find((c) => c[0] === 'eq' && c[1][0] === 'id');
    expect(eqCall![1][1]).toBe('addr-1');
  });

  it('addAddress surfaces a db error', async () => {
    getCurrentCustomer.mockResolvedValue({ id: 'cust-1', email: 'a@b.com', authUserId: 'u-1' });
    const calls: Array<[string, unknown[]]> = [];
    mockFrom.mockImplementation(() => makeChain({ data: null, error: { message: 'denied' } }, calls));

    const { addAddress } = await import('@/features/account/addresses/actions/save-address');
    const res = await addAddress({ recipientName: 'A', address: ADDR });
    expect(res.error).toBeTruthy();
  });
});
