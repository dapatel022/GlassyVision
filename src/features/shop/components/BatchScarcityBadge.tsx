'use client';

interface BatchScarcityBadgeProps {
  dropNumber?: string;
  totalAllocation?: number;
  allocatedCount?: number;
}

export default function BatchScarcityBadge({
  dropNumber = '01',
  totalAllocation = 500,
  allocatedCount = 342,
}: BatchScarcityBadgeProps) {
  const percentage = Math.round((allocatedCount / totalAllocation) * 100);

  return (
    <div className="inline-flex items-center gap-3 px-3.5 py-1.5 bg-ink text-white rounded-full border border-line shadow-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
      </span>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-gray-200">
        DROP N° {dropNumber} · {totalAllocation} PIECES WORLDWIDE · <span className="text-accent font-black">{percentage}% ALLOCATED</span>
      </p>
    </div>
  );
}
