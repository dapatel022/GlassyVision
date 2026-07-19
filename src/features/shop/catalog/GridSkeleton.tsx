interface GridSkeletonProps {
  count?: number;
}

export default function GridSkeleton({ count = 12 }: GridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-line rounded-xl overflow-hidden bg-white">
          <div className="aspect-square bg-base-deeper animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-3 w-3/4 bg-base-deeper rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-base-deeper rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
