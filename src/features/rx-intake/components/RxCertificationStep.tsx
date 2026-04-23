'use client';

import { useState } from 'react';

interface RxCertificationStepProps {
  onSubmit: (certified: boolean, expirationDate: string | null) => void;
  submitting: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

export default function RxCertificationStep({ onSubmit, submitting, errors, warnings }: RxCertificationStepProps) {
  const [certified, setCertified] = useState(false);
  const [expirationDate, setExpirationDate] = useState('');

  return (
    <div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
        Certify Your Prescription
      </h2>
      <p className="text-muted mb-6">
        Please review and confirm the following before submitting.
      </p>

      <div className="bg-base-deeper border border-line rounded-lg p-4 mb-6">
        <p className="text-sm text-muted leading-relaxed">
          Your prescription is your responsibility. GlassyVision does not perform eye exams and does not verify
          prescriptions with your eye care professional. By submitting this prescription you certify it is current,
          valid, and issued to you by a licensed eye care professional. Online eyewear is not a substitute for a
          comprehensive eye examination.
        </p>
      </div>

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={certified}
          onChange={(e) => setCertified(e.target.checked)}
          className="mt-1 w-5 h-5 rounded border-line accent-accent"
        />
        <span className="text-sm text-ink font-medium">
          I certify this prescription is current, valid, and unexpired
        </span>
      </label>

      <div className="mb-6">
        <label className="block text-xs font-sans font-bold text-muted-soft uppercase tracking-wider mb-1">
          Rx Expiration Date (optional)
        </label>
        <input
          type="date"
          value={expirationDate}
          onChange={(e) => setExpirationDate(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg text-sm font-mono bg-white focus:outline-none focus:border-accent"
        />
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-warning/20 rounded-lg">
          <p className="text-sm font-bold text-warning mb-1">Please review:</p>
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-warning">{w.message}</p>
          ))}
          <p className="text-xs text-muted mt-2">You can still submit — our team will review carefully.</p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-error/20 rounded-lg">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-error">{e.message}</p>
          ))}
        </div>
      )}

      <button
        onClick={() => onSubmit(certified, expirationDate || null)}
        disabled={submitting}
        className="w-full px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit Prescription'}
      </button>

      <p className="text-xs text-muted-soft text-center mt-3">
        Not a substitute for an eye exam.
      </p>
    </div>
  );
}
