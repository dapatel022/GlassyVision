'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { moveJob } from '../actions/move-job';
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
            <p className="text-sm font-mono">{job.qcPhotoCount} uploaded</p>
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
