'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { moveJob } from '../actions/move-job';
import { addQcPhoto } from '../actions/add-qc-photo';
import { type KanbanJob, COLUMN_LABELS, COLUMNS_ORDER } from './types';

interface Props {
  job: KanbanJob;
  onClose: () => void;
}

export default function JobDetailModal({ job, onClose }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState(job.column);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(job.qcPhotoCount);

  async function handleQcUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch('/api/lab/qc-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, filename: file.name, mimeType: file.type || 'image/jpeg' }),
      });
      if (!urlRes.ok) throw new Error('Failed to sign upload');
      const { signedUrl, storagePath } = await urlRes.json();
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload failed');
      const save = await addQcPhoto(job.id, storagePath);
      if (save.success) setUploadCount((n) => n + 1);
      else throw new Error(save.error ?? 'Save failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  }

  async function handleMove() {
    if (target === job.column) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await moveJob(job.id, target);
    if (result.success) {
      router.refresh();
      onClose();
    } else {
      setError(result.error ?? 'Move failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-1">Lab job</p>
        <h3 className="font-sans font-black text-xl text-ink mb-1">{job.workOrderNumber}</h3>
        <p className="text-sm text-muted mb-4">{job.frameSku} · {job.customerName}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">
              Move to column
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as typeof target)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm"
            >
              {COLUMNS_ORDER.map((c) => (
                <option key={c} value={c}>{COLUMN_LABELS[c]}</option>
              ))}
            </select>
            {job.column === 'qc' && job.qcPhotoCount === 0 && target !== 'qc' && (
              <p className="text-xs text-warning mt-1">
                QC photos required before leaving QC. Upload on work-order detail page.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Priority</p>
            <p className="text-sm font-mono">P{job.priority}</p>
          </div>

          <div>
            <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">QC photos</p>
            <p className="text-sm font-mono mb-2">{uploadCount} uploaded</p>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-xs font-sans font-bold uppercase tracking-wider cursor-pointer hover:bg-base-deeper">
              {uploading ? 'Uploading…' : '+ Add photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                capture="environment"
                className="hidden"
                onChange={handleQcUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-line rounded-lg text-sm font-sans font-bold uppercase tracking-wider"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-sans font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {submitting ? 'Moving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 text-center">
          <a
            href={`/admin/work-orders/${job.workOrderId}`}
            className="text-xs text-accent underline"
          >
            Open full work-order detail →
          </a>
        </div>
      </div>
    </div>
  );
}
