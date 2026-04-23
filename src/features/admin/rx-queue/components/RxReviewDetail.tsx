'use client';

import { useState, useEffect, useCallback } from 'react';
import { reviewRx } from '../actions/review-rx';
import type { Database } from '@/lib/supabase/types';

type RxRejectionReason = Database['public']['Enums']['rx_rejection_reason'];

interface RxDetail {
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
}

interface RxReviewDetailProps {
  detail: RxDetail;
  reviewerUserId: string;
  onReviewComplete: () => void;
}

const REJECTION_REASONS: { value: RxRejectionReason; label: string }[] = [
  { value: 'image_too_blurry', label: 'Image too blurry' },
  { value: 'mismatch_typed_vs_image', label: "Typed values don't match image" },
  { value: 'expired_rx', label: 'Prescription is expired' },
  { value: 'suspicious', label: 'Suspicious / possibly fraudulent' },
  { value: 'wrong_document_type', label: 'Wrong document (not a prescription)' },
  { value: 'other', label: 'Other' },
];

export default function RxReviewDetail({ detail, reviewerUserId, onReviewComplete }: RxReviewDetailProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<RxRejectionReason>('image_too_blurry');
  const [rejectNotes, setRejectNotes] = useState('');

  const handleApprove = useCallback(async () => {
    setSubmitting(true);
    await reviewRx({
      rxFileId: detail.id,
      reviewerUserId,
      decision: 'approved',
      decisionReason: 'clean_approved',
      notes: null,
    });
    setSubmitting(false);
    onReviewComplete();
  }, [detail.id, reviewerUserId, onReviewComplete]);

  async function handleReject() {
    setSubmitting(true);
    await reviewRx({
      rxFileId: detail.id,
      reviewerUserId,
      decision: 'rejected',
      decisionReason: rejectReason,
      notes: rejectNotes || null,
    });
    setSubmitting(false);
    setShowRejectModal(false);
    onReviewComplete();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showRejectModal) return;
      if (e.key === 'a' || e.key === 'A') handleApprove();
      if (e.key === 'r' || e.key === 'R') setShowRejectModal(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRejectModal, handleApprove]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 bg-white rounded-lg border border-line overflow-auto p-2 mb-4">
        {detail.mimeType === 'application/pdf' ? (
          <iframe src={detail.imageUrl} className="w-full h-full min-h-[500px]" title="Rx PDF" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.imageUrl}
            alt="Prescription"
            className="max-w-full max-h-[600px] mx-auto cursor-zoom-in"
            onClick={(e) => {
              const img = e.currentTarget;
              img.classList.toggle('max-h-[600px]');
              img.classList.toggle('max-h-none');
            }}
          />
        )}
      </div>

      <div className="bg-base-deeper rounded-lg p-4 mb-4">
        <p className="font-sans font-bold text-xs uppercase tracking-wider text-muted-soft mb-2">Typed Values</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono">
          <span>OD SPH: {detail.typedValues.odSphere || '—'}</span>
          <span>OS SPH: {detail.typedValues.osSphere || '—'}</span>
          <span>OD CYL: {detail.typedValues.odCylinder || '—'}</span>
          <span>OS CYL: {detail.typedValues.osCylinder || '—'}</span>
          <span>OD AXIS: {detail.typedValues.odAxis || '—'}</span>
          <span>OS AXIS: {detail.typedValues.osAxis || '—'}</span>
          <span className="col-span-2">PD: {detail.typedValues.pd || '—'}</span>
        </div>
        {detail.expirationDate && (
          <p className="text-sm mt-2">Exp: {detail.expirationDate}</p>
        )}
        <p className="text-xs mt-2 text-muted">
          Certified: {detail.certificationChecked ? 'Yes' : 'No'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="flex-1 px-4 py-3 bg-success text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-success/90 disabled:opacity-50"
        >
          Approve (A)
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={submitting}
          className="flex-1 px-4 py-3 bg-error text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-error/90 disabled:opacity-50"
        >
          Reject (R)
        </button>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-sans font-black text-lg text-ink mb-4">Reject Prescription</h3>
            <label className="block text-sm font-bold text-muted-soft mb-1">Reason</label>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value as RxRejectionReason)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm mb-4"
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <label className="block text-sm font-bold text-muted-soft mb-1">Notes (optional)</label>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm mb-4"
              rows={3}
              placeholder="Additional details for the customer..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 px-4 py-2 border border-line rounded-lg text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-error text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
