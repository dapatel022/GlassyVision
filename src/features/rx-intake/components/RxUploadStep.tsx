'use client';

import { useState, useRef } from 'react';
import RxPhotoTips from './RxPhotoTips';

interface RxUploadStepProps {
  orderId: string;
  lineItemId: string;
  token: string;
  exp: number;
  onUploadComplete: (storagePath: string, mimeType: string) => void;
  onSkipLater: () => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/heic,image/heif,application/pdf';
const MAX_SIZE = 10 * 1024 * 1024;

export default function RxUploadStep({ orderId, lineItemId, token, exp, onUploadComplete, onSkipLater }: RxUploadStepProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (file.size > MAX_SIZE) {
      setError('File is too large (max 10 MB)');
      return;
    }

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }

    setUploading(true);
    setProgress(10);

    try {
      const urlRes = await fetch('/api/rx/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          lineItemId,
          token,
          exp,
          filename: file.name,
          mimeType: file.type || 'image/jpeg',
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json();
        throw new Error(err.error || 'Failed to get upload URL');
      }

      const { signedUrl, storagePath } = await urlRes.json();
      setProgress(30);

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed — please try again');
      }

      setProgress(100);
      onUploadComplete(storagePath, file.type || 'image/jpeg');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      setProgress(0);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleRetake() {
    setPreview(null);
    setUploading(false);
    setProgress(0);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
        Upload Your Prescription
      </h2>
      <p className="text-muted mb-6">
        Take a photo or upload an image of your prescription. We accept JPEG, PNG, HEIC, and PDF.
      </p>

      <RxPhotoTips />

      {!preview && !uploading && (
        <div
          className="border-2 border-dashed border-line rounded-xl p-8 text-center hover:border-accent transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="space-y-4">
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg cursor-pointer hover:bg-accent-light transition-colors">
              Take a Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleInputChange}
              />
            </label>

            <p className="text-muted text-sm">or</p>

            <label className="inline-flex items-center gap-2 px-6 py-3 border border-line text-ink font-sans font-bold text-sm uppercase tracking-wider rounded-lg cursor-pointer hover:bg-base-deeper transition-colors">
              Choose from Files
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={handleInputChange}
              />
            </label>

            <p className="text-muted-soft text-xs mt-2">
              Drag and drop also works. Max 10 MB.
            </p>
          </div>
        </div>
      )}

      {preview && !uploading && (
        <div className="space-y-4">
          <div className="border border-line rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Prescription preview" className="w-full max-h-96 object-contain bg-white" />
          </div>
          <button
            onClick={handleRetake}
            className="text-sm text-accent underline hover:text-accent-light"
          >
            Retake / Choose different file
          </button>
        </div>
      )}

      {uploading && (
        <div className="space-y-2">
          <div className="h-2 bg-base-deeper rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {progress < 100 ? 'Uploading...' : 'Upload complete!'}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-error/20 rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <div className="mt-8 text-center">
        <button onClick={onSkipLater} className="text-sm text-muted hover:text-ink underline">
          I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}
