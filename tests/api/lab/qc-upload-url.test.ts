import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSignedUploadUrl = vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://x/up', token: 'tok' }, error: null }));
const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ storage: { from: storageFrom } })),
}));

vi.mock('@/lib/auth/middleware', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: 'lab-1', email: 'lab@x.com', role: 'lab_qc', fullName: 'L' })),
  isLabRole: (role: string) => ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'].includes(role),
}));

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Parameters<typeof import('@/app/api/lab/qc-upload-url/route').POST>[0];
}

beforeEach(() => {
  storageFrom.mockClear();
  createSignedUploadUrl.mockClear();
});

describe('POST /api/lab/qc-upload-url', () => {
  it('returns 403 for a logged-in non-lab user and never signs an upload URL', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'r-1', email: 'r@x.com', role: 'reviewer', fullName: 'R' });

    const { POST } = await import('@/app/api/lab/qc-upload-url/route');
    const res = await POST(req({ jobId: 'job-1', filename: 'a.jpg', mimeType: 'image/jpeg' }));

    expect(res.status).toBe(403);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { getCurrentUser } = await import('@/lib/auth/middleware');
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/lab/qc-upload-url/route');
    const res = await POST(req({ jobId: 'job-1', filename: 'a.jpg', mimeType: 'image/jpeg' }));
    expect(res.status).toBe(401);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('signs an upload URL for a lab user', async () => {
    const { POST } = await import('@/app/api/lab/qc-upload-url/route');
    const res = await POST(req({ jobId: 'job-1', filename: 'a.jpg', mimeType: 'image/jpeg' }));
    expect(res.status).toBe(200);
    expect(storageFrom).toHaveBeenCalledWith('qc-photos');
  });
});
