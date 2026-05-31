'use client';

import { useState, useRef, useEffect } from 'react';

interface WebcamPdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (pdValue: number) => void;
}

export default function WebcamPdModal({ isOpen, onClose, onApply }: WebcamPdModalProps) {
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Card Calibration, Step 2: Pupil Alignment
  const [useMock, setUseMock] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calibration state in percentages of container width/height
  const [cardLeft, setCardLeft] = useState(30);
  const [cardTop, setCardTop] = useState(40);
  const [cardWidth, setCardWidth] = useState(40);
  const [cardHeight, setCardHeight] = useState(25);

  // Draggable handle positions for pupils (in percentage)
  const [pupilLeft, setPupilLeft] = useState(42);
  const [pupilRight, setPupilRight] = useState(58);
  const [pupilY, setPupilY] = useState(32);

  // Active dragging tracking
  const [isDragging, setIsDragging] = useState<'card-left' | 'card-right' | 'card-top' | 'card-bottom' | 'pupil-left' | 'pupil-right' | 'pupil-y' | null>(null);

  // Capture the created stream locally so cleanup always stops the live track
  // (no stale-closure leak). A face-pointed camera must shut off the instant
  // the modal closes.
  useEffect(() => {
    if (!isOpen) return;

    let activeStream: MediaStream | null = null;
    let cancelled = false;
    const videoEl = videoRef.current;

    (async () => {
      try {
        setUseMock(false);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        console.warn('Camera access denied or unavailable, using interactive simulator.', err);
        if (!cancelled) setUseMock(true);
      }
    })();

    return () => {
      cancelled = true;
      if (activeStream) activeStream.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate pupillary distance
  // Standard credit card width is 85.6 mm.
  // We compute pixel ratios:
  // card width in percent: cardWidth
  // pupil separation in percent: pupilRight - pupilLeft
  // PD in mm = ((pupilRight - pupilLeft) / cardWidth) * 85.6
  const calculatedPd = cardWidth > 0 ? ((pupilRight - pupilLeft) / cardWidth) * 85.6 : 63;
  const roundedPd = Math.round(calculatedPd * 10) / 10;

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    if (isDragging === 'card-left') {
      const rightEdge = cardLeft + cardWidth;
      const newLeft = Math.max(0, Math.min(rightEdge - 5, clampedX));
      setCardLeft(newLeft);
      setCardWidth(rightEdge - newLeft);
    } else if (isDragging === 'card-right') {
      const newWidth = Math.max(5, clampedX - cardLeft);
      setCardWidth(newWidth);
    } else if (isDragging === 'card-top') {
      const bottomEdge = cardTop + cardHeight;
      const newTop = Math.max(0, Math.min(bottomEdge - 5, clampedY));
      setCardTop(newTop);
      setCardHeight(bottomEdge - newTop);
    } else if (isDragging === 'card-bottom') {
      const newHeight = Math.max(5, clampedY - cardTop);
      setCardHeight(newHeight);
    } else if (isDragging === 'pupil-left') {
      setPupilLeft(Math.max(0, Math.min(pupilRight - 2, clampedX)));
    } else if (isDragging === 'pupil-right') {
      setPupilRight(Math.max(pupilLeft + 2, Math.min(100, clampedX)));
    } else if (isDragging === 'pupil-y') {
      setPupilY(clampedY);
    }
  }

  function handleMouseUp() {
    setIsDragging(null);
  }

  function handleApply() {
    onApply(roundedPd);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 backdrop-blur-sm p-4 select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="bg-white border border-line rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-base">
          <div>
            <h3 className="font-sans text-lg font-black uppercase text-ink tracking-tight">
              Webcam PD Tool
            </h3>
            <p className="text-xs text-muted-soft">
              Step {step} of 2: {step === 1 ? 'Calibrate scale with card' : 'Align markers with pupils'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink font-mono text-sm uppercase tracking-wider"
          >
            Cancel ×
          </button>
        </div>

        {/* Viewport Container */}
        <div
          ref={containerRef}
          className="relative bg-black aspect-[4/3] w-full overflow-hidden"
        >
          {useMock ? (
            <div className="absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-b from-black/60 to-black/90">
              {/* Fallback Simulator background design representing a person */}
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <svg width="240" height="240" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="1.5">
                  {/* Face Outline */}
                  <path d="M20 40 C20 15, 80 15, 80 40 C80 65, 70 80, 50 82 C30 80, 20 65, 20 40 Z" />
                  {/* Pupils */}
                  <circle cx="38" cy="38" r="1.5" fill="white" />
                  <circle cx="62" cy="38" r="1.5" fill="white" />
                  {/* Card mockup */}
                  <rect x="25" y="45" width="50" height="30" rx="3" stroke="white" strokeDasharray="3 3" />
                  <line x1="25" y1="52" x2="75" y2="52" stroke="white" strokeDasharray="3 3" />
                </svg>
              </div>
              <div className="z-10 bg-accent/90 backdrop-blur text-white text-[10px] px-3 py-1.5 rounded-full font-mono uppercase tracking-wider self-start">
                Simulator Active (Camera Disabled)
              </div>
              <div className="z-10 text-center text-white/70 text-xs px-8 pointer-events-none">
                Adjust the boxes to see how the mathematical measurement works! Drag the blue outline corners to match the card and place the green crosshairs over your pupils.
              </div>
              <div></div>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" // mirror view
            />
          )}

          {/* Step 1: Card Calibration Overlay */}
          {step === 1 && (
            <div
              className="absolute border-2 border-accent rounded-lg cursor-move"
              style={{
                left: `${cardLeft}%`,
                top: `${cardTop}%`,
                width: `${cardWidth}%`,
                height: `${cardHeight}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
              }}
            >
              {/* Magnetic stripe visualization */}
              <div className="absolute top-4 left-0 right-0 h-4 bg-ink/75" />
              <div className="absolute bottom-2 left-2 text-[8px] font-mono text-accent bg-white/90 px-1 rounded">
                Scale Reference Card (85.6mm)
              </div>

              {/* Drag handles */}
              <div
                className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-accent/25 hover:bg-accent/50"
                onMouseDown={() => setIsDragging('card-left')}
              />
              <div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-accent/25 hover:bg-accent/50"
                onMouseDown={() => setIsDragging('card-right')}
              />
              <div
                className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize bg-accent/25 hover:bg-accent/50"
                onMouseDown={() => setIsDragging('card-top')}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize bg-accent/25 hover:bg-accent/50"
                onMouseDown={() => setIsDragging('card-bottom')}
              />
            </div>
          )}

          {/* Step 2: Pupil Alignment Overlay */}
          {step === 2 && (
            <>
              {/* Dim background */}
              <div className="absolute inset-0 bg-black/30 pointer-events-none" />

              {/* Left Pupil Target */}
              <div
                className="absolute w-8 h-8 -ml-4 -mt-4 cursor-crosshair group"
                style={{ left: `${pupilLeft}%`, top: `${pupilY}%` }}
                onMouseDown={() => setIsDragging('pupil-left')}
              >
                {/* Outer Ring */}
                <div className="w-full h-full rounded-full border-2 border-success animate-pulse" />
                {/* Horizontal Crosshair */}
                <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-success" />
                {/* Vertical Crosshair */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-success" />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-mono bg-success text-white px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  R Pupil
                </div>
              </div>

              {/* Right Pupil Target */}
              <div
                className="absolute w-8 h-8 -ml-4 -mt-4 cursor-crosshair group"
                style={{ left: `${pupilRight}%`, top: `${pupilY}%` }}
                onMouseDown={() => setIsDragging('pupil-right')}
              >
                {/* Outer Ring */}
                <div className="w-full h-full rounded-full border-2 border-success animate-pulse" />
                <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-success" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-success" />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-mono bg-success text-white px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  L Pupil
                </div>
              </div>

              {/* Linking PD Line */}
              <div
                className="absolute h-[1.5px] bg-success/60 border-t border-dashed border-success/60 flex items-center justify-center cursor-ns-resize"
                style={{
                  left: `${pupilLeft}%`,
                  width: `${pupilRight - pupilLeft}%`,
                  top: `${pupilY}%`,
                }}
                onMouseDown={() => setIsDragging('pupil-y')}
              >
                <span className="bg-success text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full -mt-0.5 z-10 shadow">
                  PD: {roundedPd}mm
                </span>
              </div>
            </>
          )}
        </div>

        {/* Modal Controls */}
        <div className="px-6 py-4 border-t border-line bg-base flex justify-between items-center">
          <div className="flex items-center gap-1 font-mono text-sm text-ink">
            <span className="text-muted-soft uppercase mr-1">Result:</span>
            <span className="font-bold text-accent text-lg">{roundedPd}</span>
            <span className="text-xs text-muted-soft uppercase font-bold">mm</span>
          </div>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 border border-line text-ink font-sans font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-base-deeper transition-colors"
              >
                Back to Card
              </button>
            )}

            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 bg-accent text-white font-sans font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors"
              >
                Next: Align Pupils
              </button>
            ) : (
              <button
                onClick={handleApply}
                className="px-5 py-2.5 bg-success text-white font-sans font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-success-light transition-colors"
              >
                Confirm & Apply PD
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
