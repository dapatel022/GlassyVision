'use client';

import { useState } from 'react';
import KanbanColumn from './KanbanColumn';
import JobDetailModal from './JobDetailModal';
import { COLUMNS_ORDER, type KanbanJob } from './types';

interface Props {
  jobs: KanbanJob[];
}

export default function KanbanBoard({ jobs }: Props) {
  const [selectedJob, setSelectedJob] = useState<KanbanJob | null>(null);

  const grouped = COLUMNS_ORDER.map((col) => ({
    column: col,
    jobs: jobs.filter((j) => j.column === col),
  }));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {grouped.map(({ column, jobs }) => (
          <KanbanColumn
            key={column}
            column={column}
            jobs={jobs}
            onJobClick={setSelectedJob}
          />
        ))}
      </div>
      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
}
