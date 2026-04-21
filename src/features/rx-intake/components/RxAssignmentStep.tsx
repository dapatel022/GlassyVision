'use client';

interface LineItem {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
}

interface RxAssignmentStepProps {
  lineItems: LineItem[];
  onChoice: (mode: 'same' | 'per-item') => void;
}

export default function RxAssignmentStep({ lineItems, onChoice }: RxAssignmentStepProps) {
  return (
    <div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
        Your Order Has Multiple Rx Items
      </h2>
      <p className="text-muted mb-6">
        Do you want to use the same prescription for all items, or upload a different one for each?
      </p>

      <div className="space-y-3 mb-6">
        {lineItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3 p-3 bg-base-deeper rounded-lg">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div>
              <p className="text-sm font-bold text-ink">{item.productTitle}</p>
              {item.variantTitle && <p className="text-xs text-muted">{item.variantTitle}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onChoice('same')}
          className="p-4 border border-line rounded-lg hover:border-accent transition-colors text-left"
        >
          <p className="font-sans font-bold text-sm text-ink">Same Rx for All</p>
          <p className="text-xs text-muted mt-1">Upload one prescription</p>
        </button>
        <button
          onClick={() => onChoice('per-item')}
          className="p-4 border border-line rounded-lg hover:border-accent transition-colors text-left"
        >
          <p className="font-sans font-bold text-sm text-ink">Different Rx Each</p>
          <p className="text-xs text-muted mt-1">Upload {lineItems.length} prescriptions</p>
        </button>
      </div>
    </div>
  );
}
