'use client';

interface QueueItem {
  id: string;
  orderNumber: string;
  customerEmail: string;
  uploadedAt: string;
  hasWarnings: boolean;
}

interface RxQueueListProps {
  items: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function RxQueueList({ items, selectedId, onSelect }: RxQueueListProps) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-muted">
        <p className="font-serif italic">No prescriptions pending review.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`w-full text-left p-4 hover:bg-base-deeper transition-colors ${
            selectedId === item.id ? 'bg-base-deeper border-l-2 border-accent' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm font-bold text-ink">{item.orderNumber}</p>
            {item.hasWarnings && (
              <span className="text-xs px-2 py-0.5 bg-warning/10 text-warning rounded-full">warnings</span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">{item.customerEmail}</p>
          <p className="text-xs text-muted-soft mt-1">
            {new Date(item.uploadedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </button>
      ))}
    </div>
  );
}
