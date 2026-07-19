import GridSkeleton from '@/features/shop/catalog/GridSkeleton';

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="h-10 w-64 bg-base-deeper rounded animate-pulse mb-10" />
      <GridSkeleton count={12} />
    </div>
  );
}
