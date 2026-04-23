'use client';

import Link from 'next/link';
import type { KanbanJob } from './types';

interface Props {
  job: KanbanJob;
  onClick: () => void;
}

export default function JobCard({ job, onClick }: Props) {
  const priorityColor =
    job.priority >= 8 ? 'bg-error text-white' : job.priority >= 6 ? 'bg-warning text-white' : 'bg-base-deeper text-muted';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 border border-line rounded-lg bg-white hover:border-accent transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          href={`/admin/work-orders/${job.workOrderId}`}
          className="font-mono text-xs text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {job.workOrderNumber}
        </Link>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${priorityColor}`}>P{job.priority}</span>
      </div>
      <p className="text-sm font-bold text-ink truncate">{job.frameSku}</p>
      <p className="text-xs text-muted mt-0.5 truncate">{job.customerName}</p>
      {job.assigneeName && (
        <p className="text-[10px] text-muted-soft mt-1">→ {job.assigneeName}</p>
      )}
    </button>
  );
}
