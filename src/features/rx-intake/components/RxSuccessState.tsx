'use client';

export default function RxSuccessState() {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
        Prescription Uploaded!
      </h2>
      <p className="text-muted max-w-md mx-auto">
        We&apos;ll review your prescription within 24 hours and email you once it&apos;s approved.
        Your order will be held until then.
      </p>
    </div>
  );
}
