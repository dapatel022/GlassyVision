'use client';

export default function RxPhotoTips() {
  return (
    <div className="bg-base-deeper border border-line rounded-lg p-4 mb-4">
      <p className="font-sans font-bold text-sm text-ink mb-2">Tips for a clear photo:</p>
      <ul className="text-sm text-muted space-y-1">
        <li>Place your prescription on a flat, well-lit surface</li>
        <li>Make sure all text is readable and all corners are visible</li>
        <li>Avoid shadows and glare</li>
        <li>If you have a PDF from your eye doctor, you can upload that too</li>
      </ul>
    </div>
  );
}
