'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RxQueueList from '@/features/admin/rx-queue/components/RxQueueList';
import RxReviewDetail from '@/features/admin/rx-queue/components/RxReviewDetail';

interface QueueItem {
  id: string;
  orderNumber: string;
  customerEmail: string;
  storagePath: string;
  imageUrl: string;
  mimeType: string;
  uploadedAt: string;
  typedValues: {
    odSphere: string | null; odCylinder: string | null; odAxis: string | null;
    osSphere: string | null; osCylinder: string | null; osAxis: string | null;
    pd: string | null;
  };
  autoCheckResults: Record<string, unknown> | null;
  certificationChecked: boolean;
  expirationDate: string | null;
  hasWarnings: boolean;
}

interface RxQueueClientProps {
  items: QueueItem[];
}

export default function RxQueueClient({ items }: RxQueueClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id || null);
  const router = useRouter();
  const selected = items.find((i) => i.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">
          Rx Review Queue
          <span className="ml-2 text-sm font-mono text-muted align-middle">
            {items.length} pending
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-6 min-h-[600px]">
        <div className="col-span-4 border border-line rounded-lg overflow-auto bg-white">
          <RxQueueList
            items={items.map((i) => ({
              id: i.id,
              orderNumber: i.orderNumber,
              customerEmail: i.customerEmail,
              uploadedAt: i.uploadedAt,
              hasWarnings: i.hasWarnings,
            }))}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="col-span-8">
          {selected ? (
            <RxReviewDetail
              detail={selected}
              onReviewComplete={() => router.refresh()}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted">
              <p className="font-serif italic">Select a prescription to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
