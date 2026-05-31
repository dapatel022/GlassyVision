'use client';

import { useState, useRef, useEffect } from 'react';
import type { ShopifyProduct } from '@/lib/commerce/types';

interface VirtualTryOnProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShopifyProduct;
}

// Preset model faces for static fallback
const PRESET_MODELS = [
  { id: 'model-1', name: 'Model A', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&h=500&q=80' },
  { id: 'model-2', name: 'Model B', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&h=500&q=80' },
  { id: 'model-3', name: 'Model C', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&h=500&q=80' }
];

export default function VirtualTryOn({ isOpen, onClose, product }: VirtualTryOnProps) {
  const [mode, setMode] = useState<'camera' | 'photo'>('photo');
  const [selectedModel, setSelectedModel] = useState(PRESET_MODELS[0]);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Manual transform adjustments for static/photo mode
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Camera stream activation. The created stream is captured in a local
  // variable so cleanup always stops the *live* track (no stale-closure leak)
  // — critical for a face-pointed camera: the indicator light must go off the
  // instant the modal closes or the user switches to preset mode.
  useEffect(() => {
    if (!isOpen || mode !== 'camera') return;

    let activeStream: MediaStream | null = null;
    let cancelled = false;
    const videoEl = videoRef.current;

    (async () => {
      try {
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
        console.warn('Camera access denied or failed in VTO. Switching to simulator.', err);
        if (!cancelled) setMode('photo');
      }
    })();

    return () => {
      cancelled = true;
      if (activeStream) activeStream.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [isOpen, mode]);

  // Revoke object URLs created for uploaded photos so they don't leak memory.
  useEffect(() => {
    return () => {
      if (userPhoto?.startsWith('blob:')) URL.revokeObjectURL(userPhoto);
    };
  }, [userPhoto]);

  if (!isOpen) return null;

  // Custom frame rendering based on active product handle
  function renderFrameOverlay() {
    const handle = product.handle;

    if (handle.includes('archetype')) {
      // GV-01 Archetype: Thick Honey Tortoise Round Frame
      return (
        <svg width="220" height="75" viewBox="0 0 220 75" fill="none" className="drop-shadow-md">
          {/* Left Lens Rim */}
          <rect x="15" y="10" width="70" height="55" rx="27" stroke="#c9b77a" strokeWidth="9" fill="transparent" />
          <rect x="18" y="13" width="64" height="49" rx="24.5" stroke="#7a622a" strokeWidth="2.5" fill="transparent" />
          
          {/* Right Lens Rim */}
          <rect x="135" y="10" width="70" height="55" rx="27" stroke="#c9b77a" strokeWidth="9" fill="transparent" />
          <rect x="138" y="13" width="64" height="49" rx="24.5" stroke="#7a622a" strokeWidth="2.5" fill="transparent" />
          
          {/* Bridge */}
          <path d="M 85,25 Q 110,14 135,25" stroke="#c9b77a" strokeWidth="7" fill="transparent" />
          <path d="M 85,25 Q 110,14 135,25" stroke="#7a622a" strokeWidth="2" fill="transparent" />

          {/* Temples / Hinges */}
          <path d="M 15,30 L 2,26" stroke="#c9b77a" strokeWidth="6" strokeLinecap="round" />
          <path d="M 205,30 L 218,26" stroke="#c9b77a" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    } else if (handle.includes('linear')) {
      // GV-02 Linear: Thin Gunmetal Round Frame
      return (
        <svg width="220" height="75" viewBox="0 0 220 75" fill="none" className="drop-shadow-sm">
          {/* Left Lens Rim */}
          <circle cx="50" cy="37" r="28" stroke="#4a5568" strokeWidth="2.5" fill="transparent" />
          {/* Right Lens Rim */}
          <circle cx="170" cy="37" r="28" stroke="#4a5568" strokeWidth="2.5" fill="transparent" />
          {/* Bridge */}
          <path d="M 78,35 Q 110,24 142,35" stroke="#4a5568" strokeWidth="2.5" fill="transparent" />
          {/* Nose pads */}
          <path d="M 74,45 Q 77,48 76,52" stroke="#cbd5e1" strokeWidth="2" fill="transparent" />
          <path d="M 146,45 Q 143,48 144,52" stroke="#cbd5e1" strokeWidth="2" fill="transparent" />
          {/* Temples */}
          <path d="M 22,35 L 2,33" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
          <path d="M 198,35 L 218,33" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    } else if (handle.includes('voyager')) {
      // GV-03 Voyager: Gold Aviator Sunglasses (polarized green lenses)
      return (
        <svg width="220" height="85" viewBox="0 0 220 85" fill="none" className="drop-shadow-md">
          {/* Left Lens Fill (Green tinted) */}
          <path d="M 12,20 C 12,20 48,15 84,20 C 84,45 80,68 50,70 C 20,68 12,45 12,20 Z" fill="rgba(45, 90, 78, 0.65)" />
          {/* Left Lens gold rim */}
          <path d="M 12,20 C 12,20 48,15 84,20 C 84,45 80,68 50,70 C 20,68 12,45 12,20 Z" stroke="#d4af37" strokeWidth="3" fill="transparent" />

          {/* Right Lens Fill (Green tinted) */}
          <path d="M 136,20 C 136,20 172,15 208,20 C 208,45 200,68 170,70 C 140,68 136,45 136,20 Z" fill="rgba(45, 90, 78, 0.65)" />
          {/* Right Lens gold rim */}
          <path d="M 136,20 C 136,20 172,15 208,20 C 208,45 200,68 170,70 C 140,68 136,45 136,20 Z" stroke="#d4af37" strokeWidth="3" fill="transparent" />

          {/* Double Bridge */}
          <path d="M 84,23 L 136,23" stroke="#d4af37" strokeWidth="3" />
          <path d="M 84,15 L 136,15" stroke="#d4af37" strokeWidth="2.5" />

          {/* Temples */}
          <path d="M 12,20 L 2,17" stroke="#d4af37" strokeWidth="3" />
          <path d="M 208,20 L 218,17" stroke="#d4af37" strokeWidth="3" />
        </svg>
      );
    } else {
      // GV-04 Editor: Thick Black Square Acetate Frame
      return (
        <svg width="220" height="75" viewBox="0 0 220 75" fill="none" className="drop-shadow-lg">
          {/* Left Lens Rim */}
          <rect x="15" y="10" width="70" height="55" rx="14" stroke="#0a0a0a" strokeWidth="9.5" fill="transparent" />
          
          {/* Right Lens Rim */}
          <rect x="135" y="10" width="70" height="55" rx="14" stroke="#0a0a0a" strokeWidth="9.5" fill="transparent" />
          
          {/* Bridge */}
          <path d="M 85,25 Q 110,18 135,25" stroke="#0a0a0a" strokeWidth="8" fill="transparent" />

          {/* Silver dual hinges pins */}
          <circle cx="22" cy="18" r="1.5" fill="#e2e8f0" />
          <circle cx="27" cy="18" r="1.5" fill="#e2e8f0" />
          <circle cx="193" cy="18" r="1.5" fill="#e2e8f0" />
          <circle cx="198" cy="18" r="1.5" fill="#e2e8f0" />

          {/* Temples */}
          <path d="M 15,30 L 2,28" stroke="#0a0a0a" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M 205,30 L 218,28" stroke="#0a0a0a" strokeWidth="7.5" strokeLinecap="round" />
        </svg>
      );
    }
  }

  // Interactive Dragging Handlers (for static model overlay)
  function handleMouseDown(e: React.MouseEvent) {
    if (mode !== 'photo') return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUserPhoto(url);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 backdrop-blur-sm p-4"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="bg-white border border-line rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh] md:h-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-base">
          <div>
            <h3 className="font-sans text-lg font-black uppercase text-ink tracking-tight">
              AR Virtual Try-On
            </h3>
            <p className="text-xs text-muted-soft">
              Fitting frame: <span className="font-bold text-accent">{product.title}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink font-mono text-sm uppercase tracking-wider">
            Close ×
          </button>
        </div>

        {/* Viewport & controls */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-base-deeper">
          {/* Main Viewport */}
          <div
            ref={containerRef}
            className="flex-1 relative aspect-[4/3] md:aspect-square bg-black overflow-hidden flex items-center justify-center cursor-crosshair"
            onMouseDown={handleMouseDown}
          >
            {mode === 'camera' ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userPhoto || selectedModel.url}
                alt="Try-on face background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
              />
            )}

            {/* Glasses Frame Overlay */}
            <div
              className="absolute select-none pointer-events-auto"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale / 100})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
            >
              {renderFrameOverlay()}
            </div>
          </div>

          {/* VTO Settings / Controls Sidebar */}
          <div className="w-full md:w-60 p-4 flex flex-col justify-between border-t md:border-t-0 md:border-l border-line bg-white shrink-0">
            <div className="space-y-5">
              {/* Camera vs Static Model Toggle */}
              <div>
                <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft mb-2">
                  Try-on Mode
                </p>
                <div className="flex bg-base rounded-lg p-0.5 border border-line">
                  <button
                    onClick={() => setMode('camera')}
                    className={`flex-1 text-[10px] font-sans font-bold uppercase py-1.5 rounded text-center transition-colors ${
                      mode === 'camera' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    Live Camera
                  </button>
                  <button
                    onClick={() => setMode('photo')}
                    className={`flex-1 text-[10px] font-sans font-bold uppercase py-1.5 rounded text-center transition-colors ${
                      mode === 'photo' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    Preset Faces
                  </button>
                </div>
              </div>

              {/* Conditional options for Preset Mode */}
              {mode === 'photo' && (
                <>
                  {/* Select preset model */}
                  <div>
                    <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft mb-2">
                      Choose Face Model
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESET_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedModel(m); setUserPhoto(null); }}
                          className={`px-2 py-1.5 border text-center rounded text-xs transition-colors ${
                            selectedModel.id === m.id && !userPhoto
                              ? 'border-accent bg-accent/5 font-bold text-accent'
                              : 'border-line text-muted hover:border-muted'
                          }`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload Custom Photo */}
                  <div>
                    <label className="block text-[10px] font-sans font-bold uppercase tracking-wider text-muted-soft mb-2 cursor-pointer hover:text-accent">
                      Or Upload Your Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    {userPhoto && (
                      <button
                        onClick={() => setUserPhoto(null)}
                        className="text-[10px] text-error font-sans font-bold hover:underline"
                      >
                        Reset back to models
                      </button>
                    )}
                  </div>

                  {/* Scale & Rotate Manual Controls */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-muted mb-1">
                        <span>Frame Scale</span>
                        <span>{scale}%</span>
                      </div>
                      <input
                        type="range"
                        min="60"
                        max="140"
                        value={scale}
                        onChange={(e) => setScale(parseInt(e.target.value))}
                        className="w-full h-1 bg-line rounded appearance-none cursor-pointer accent-accent"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-muted mb-1">
                        <span>Rotation</span>
                        <span>{rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min="-20"
                        max="20"
                        value={rotation}
                        onChange={(e) => setRotation(parseInt(e.target.value))}
                        className="w-full h-1 bg-line rounded appearance-none cursor-pointer accent-accent"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick guide info */}
            <div className="mt-6 border-t border-line pt-4 text-center">
              <p className="text-[10px] text-muted-soft leading-normal font-serif italic">
                {mode === 'photo'
                  ? 'Drag and place the frame overlay over the eyes. Adjust size and angle using the sliders.'
                  : 'Look directly at the camera. Position your face in the center of the frame.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
