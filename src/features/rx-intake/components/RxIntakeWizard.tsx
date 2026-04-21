'use client';

import { useState } from 'react';
import RxAssignmentStep from './RxAssignmentStep';
import RxUploadStep from './RxUploadStep';
import RxTypedValuesStep from './RxTypedValuesStep';
import RxCertificationStep from './RxCertificationStep';
import RxSuccessState from './RxSuccessState';
import type { RxTypedValues } from '../actions/auto-checks';
import { submitRx, type SubmitRxInput } from '../actions/submit-rx';

interface LineItem {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
}

interface RxIntakeWizardProps {
  orderId: string;
  orderDbId: string;
  lineItems: LineItem[];
  customerEmail: string;
  rejectionReason?: string;
}

interface UploadState {
  lineItemId: string;
  storagePath: string;
  mimeType: string;
  typedValues: RxTypedValues | null;
}

type Step = 'assignment' | 'upload' | 'typed-values' | 'certification' | 'success' | 'later';

export default function RxIntakeWizard({
  orderId, orderDbId, lineItems, customerEmail, rejectionReason,
}: RxIntakeWizardProps) {
  const [step, setStep] = useState<Step>(lineItems.length > 1 ? 'assignment' : 'upload');
  const [mode, setMode] = useState<'same' | 'per-item'>('same');
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [currentUpload, setCurrentUpload] = useState<Partial<UploadState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [warnings, setWarnings] = useState<Array<{ field: string; message: string }>>([]);

  const itemsToUpload = mode === 'same' ? [lineItems[0]] : lineItems;
  const currentItem = itemsToUpload[currentItemIdx];

  function handleAssignment(choice: 'same' | 'per-item') {
    setMode(choice);
    setStep('upload');
  }

  function handleUploadComplete(storagePath: string, mimeType: string) {
    setCurrentUpload({ lineItemId: currentItem.id, storagePath, mimeType });
    setStep('typed-values');
  }

  function handleTypedValues(values: RxTypedValues) {
    setCurrentUpload((prev) => ({ ...prev, typedValues: values }));
    setStep('certification');
  }

  function handleSkipTypedValues() {
    setCurrentUpload((prev) => ({ ...prev, typedValues: null }));
    setStep('certification');
  }

  async function handleCertification(certified: boolean, expirationDate: string | null) {
    setSubmitting(true);
    setErrors([]);
    setWarnings([]);

    const lineItemIds = mode === 'same' ? lineItems.map((li) => li.id) : [currentItem.id];

    for (const lineItemId of lineItemIds) {
      const input: SubmitRxInput = {
        orderId: orderDbId,
        lineItemId,
        storagePath: currentUpload.storagePath!,
        mimeType: currentUpload.mimeType!,
        certificationChecked: certified,
        typedValues: currentUpload.typedValues || null,
        expirationDate,
        ip: '',
        userAgent: navigator.userAgent,
      };

      const result = await submitRx(input);

      if (!result.success) {
        setErrors(result.errors?.map((e) => ({ field: e.field, message: e.message })) || []);
        setWarnings(result.warnings?.map((w) => ({ field: w.field, message: w.message })) || []);
        setSubmitting(false);

        if (result.errors?.some((e) => e.field === 'image' || e.field === 'resolution')) {
          setStep('upload');
        }
        return;
      }

      if (result.warnings && result.warnings.length > 0) {
        setWarnings(result.warnings.map((w) => ({ field: w.field, message: w.message })));
      }
    }

    if (mode === 'per-item' && currentItemIdx < itemsToUpload.length - 1) {
      setCurrentItemIdx((i) => i + 1);
      setCurrentUpload({});
      setStep('upload');
      setSubmitting(false);
      return;
    }

    setStep('success');
    setSubmitting(false);
  }

  function handleSkipLater() {
    setStep('later');
  }

  if (step === 'later') {
    return (
      <div className="text-center py-12">
        <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">
          No Problem!
        </h2>
        <p className="text-muted max-w-md mx-auto">
          We&apos;ve sent a link to <strong>{customerEmail}</strong>. Your order will be held until we receive your prescription.
        </p>
      </div>
    );
  }

  if (step === 'success') return <RxSuccessState />;

  return (
    <div className="max-w-xl mx-auto">
      {rejectionReason && step === 'upload' && (
        <div className="mb-6 p-4 bg-red-50 border border-error/20 rounded-lg">
          <p className="text-sm font-bold text-error mb-1">Your previous prescription was rejected</p>
          <p className="text-sm text-error">Reason: {rejectionReason.replace(/_/g, ' ')}</p>
          <p className="text-sm text-muted mt-1">Please upload a clearer photo.</p>
        </div>
      )}

      {mode === 'per-item' && lineItems.length > 1 && step !== 'assignment' && (
        <div className="mb-4 text-sm text-muted">
          Uploading for item {currentItemIdx + 1} of {itemsToUpload.length}: <strong>{currentItem.productTitle}</strong>
        </div>
      )}

      {step === 'assignment' && (
        <RxAssignmentStep lineItems={lineItems} onChoice={handleAssignment} />
      )}
      {step === 'upload' && (
        <RxUploadStep
          orderId={orderId}
          lineItemId={currentItem.id}
          onUploadComplete={handleUploadComplete}
          onSkipLater={handleSkipLater}
        />
      )}
      {step === 'typed-values' && (
        <RxTypedValuesStep
          initialValues={currentUpload.typedValues || null}
          onSubmit={handleTypedValues}
          onSkip={handleSkipTypedValues}
        />
      )}
      {step === 'certification' && (
        <RxCertificationStep
          onSubmit={handleCertification}
          submitting={submitting}
          errors={errors}
          warnings={warnings}
        />
      )}
    </div>
  );
}
