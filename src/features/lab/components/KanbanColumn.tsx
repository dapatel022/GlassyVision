'use client';

import { COLUMN_LABELS, type KanbanColumn as Col, type KanbanJob } from './types';
import JobCard from './JobCard';

interface Props {
  column: Col;
  jobs: KanbanJob[];
  onJobClick: (job: KanbanJob) => void;
}

export default function KanbanColumn({ column, jobs, onJobClick }: Props) {
  const sorted = [...jobs].sort((a, b) => b.priority - a.priority);
  return (
    <div className="flex flex-col bg-base-deeper rounded-lg p-3 min-h-[400px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-muted-soft">
          {COLUMN_LABELS[column]}
        </h3>
        <span className="text-xs font-mono text-muted-soft">{jobs.length}</span>
      </div>
      <div className="flex-1 space-y-2">
        {sorted.map((job) => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
      </div>
    </div>
  );
}
