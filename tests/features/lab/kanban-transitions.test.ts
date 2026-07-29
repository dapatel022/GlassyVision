import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'lab-1', email: 'l@x.com', role: 'lab_operator', fullName: 'L' })),
  isLabRole: (role: string) => role === 'lab_operator' || role === 'lab_admin' || role === 'founder',
}));

function jobTable(job: Record<string, unknown>) {
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  return {
    table: {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: job, error: null })) })) })),
      update,
    },
    update,
  };
}

const RELEASED_WO = { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { released_to_lab_at: '2026-07-01' }, error: null }) }) }) };

describe('kanban stage enforcement', () => {
  beforeEach(() => mockFrom.mockReset());

  it('rejects skipping forward more than one stage (inbox -> ship)', async () => {
    const jobs = jobTable({ id: 'j1', work_order_id: 'wo1', column: 'inbox', qc_photos: ['j1/a.jpg'], started_at: null });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : t === 'work_orders' ? RELEASED_WO : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j1', 'ship');

    expect(result.success).toBe(false);
    expect(result.error).toContain('one production stage');
    expect(jobs.update).not.toHaveBeenCalled();
  });

  it('allows advancing exactly one stage (on_edger -> on_bench)', async () => {
    const jobs = jobTable({ id: 'j2', work_order_id: 'wo1', column: 'on_edger', qc_photos: [], started_at: '2026-07-01' });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j2', 'on_bench');

    expect(result.success).toBe(true);
    expect(jobs.update).toHaveBeenCalledTimes(1);
  });

  it('allows moving backward for rework (qc -> on_bench) when QC photos exist', async () => {
    const jobs = jobTable({ id: 'j3', work_order_id: 'wo1', column: 'qc', qc_photos: ['j3/a.jpg'], started_at: '2026-07-01' });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { moveJob } = await import('@/features/lab/actions/move-job');
    const result = await moveJob('j3', 'on_bench');

    expect(result.success).toBe(true);
  });

  it('rejects attaching a QC photo while the job is not in the QC stage', async () => {
    const jobs = jobTable({ id: 'j4', work_order_id: 'wo1', column: 'on_bench', qc_photos: [] });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { addQcPhoto } = await import('@/features/lab/actions/add-qc-photo');
    const result = await addQcPhoto('j4', 'j4/photo.jpg');

    expect(result.success).toBe(false);
    expect(result.error).toContain('QC stage');
    expect(jobs.update).not.toHaveBeenCalled();
  });

  it('allows attaching a QC photo in the QC stage', async () => {
    const jobs = jobTable({ id: 'j5', work_order_id: 'wo1', column: 'qc', qc_photos: [] });
    mockFrom.mockImplementation((t: string) => (t === 'lab_jobs' ? jobs.table : {}));

    const { addQcPhoto } = await import('@/features/lab/actions/add-qc-photo');
    const result = await addQcPhoto('j5', 'j5/photo.jpg');

    expect(result.success).toBe(true);
  });
});
