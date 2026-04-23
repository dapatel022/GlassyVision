'use client';

interface RxStatusDisplayProps {
  status: 'uploaded_pending_review' | 'approved' | 'rejected';
  rejectionReason?: string;
  rejectionNotes?: string;
  onReUpload?: () => void;
}

export default function RxStatusDisplay({ status, rejectionReason, rejectionNotes, onReUpload }: RxStatusDisplayProps) {
  if (status === 'approved') {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
          Prescription Approved
        </h2>
        <p className="text-muted">Your order is in production. We&apos;ll email you when it ships.</p>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
          Prescription Needs Attention
        </h2>
        <p className="text-muted mb-2">
          <strong>Reason:</strong> {rejectionReason?.replace(/_/g, ' ')}
        </p>
        {rejectionNotes && <p className="text-muted mb-6">{rejectionNotes}</p>}
        {onReUpload && (
          <button
            onClick={onReUpload}
            className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
          >
            Upload New Prescription
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-accent animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
        Under Review
      </h2>
      <p className="text-muted">
        Your prescription is being reviewed. We&apos;ll email you within 24 hours.
      </p>
    </div>
  );
}
