'use client';

import { useState, useRef } from 'react';
import type { ShopifyProduct } from '@/lib/commerce/types';

interface LensAdvisorProps {
  product?: ShopifyProduct;
}

export default function LensAdvisor({ product }: LensAdvisorProps) {
  // Coating Simulator State
  const [sliderPos, setSliderPos] = useState(50);
  const simContainerRef = useRef<HTMLDivElement>(null);
  const [activeSim, setActiveSim] = useState<'ar' | 'photochromic'>('ar');

  // Lens Index Advisor State
  const [sphPower, setSphPower] = useState(-3.50);

  function handleTouchMove(e: React.TouchEvent) {
    if (!simContainerRef.current) return;
    const rect = simContainerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const pos = ((touch.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (e.buttons !== 1 || !simContainerRef.current) return;
    const rect = simContainerRef.current.getBoundingClientRect();
    const pos = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  }

  // Thickness factors
  const indexMaterials = [
    { name: 'Standard 1.50', index: 1.50, factor: 1.0, desc: 'CR-39. Best for light prescriptions.', cost: '$0' },
    { name: 'Polycarbonate 1.59', index: 1.59, factor: 0.8, desc: 'Impact resistant, lightweight.', cost: '+$30' },
    { name: 'High-Index 1.67', index: 1.67, factor: 0.65, desc: '35% thinner. Great for moderate prescriptions.', cost: '+$60' },
    { name: 'Ultra-Index 1.74', index: 1.74, factor: 0.5, desc: '50% thinner. For high prescriptions.', cost: '+$90' }
  ];

  // Determine recommendation based on SPH power
  const absSph = Math.abs(sphPower);
  let recommendedIndex = 1.50;
  if (absSph >= 6.00) recommendedIndex = 1.74;
  else if (absSph >= 4.00) recommendedIndex = 1.67;
  else if (absSph >= 2.00) recommendedIndex = 1.59;

  return (
    <div className="space-y-8 bg-white border border-line rounded-xl p-6 shadow-sm">
      {/* 1. Coating Reflection Simulator */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft">
            Interactive Coating Simulator
          </p>
          <div className="flex bg-base rounded-lg p-0.5 border border-line">
            <button
              onClick={() => setActiveSim('ar')}
              className={`text-[10px] font-sans font-bold uppercase px-2 py-1 rounded transition-colors ${
                activeSim === 'ar' ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              Anti-Reflective
            </button>
            <button
              onClick={() => setActiveSim('photochromic')}
              className={`text-[10px] font-sans font-bold uppercase px-2 py-1 rounded transition-colors ${
                activeSim === 'photochromic' ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              Transitions
            </button>
          </div>
        </div>

        <div
          ref={simContainerRef}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          className="relative h-52 rounded-lg overflow-hidden cursor-ew-resize select-none border border-line"
        >
          {/* Base Layer: Dark Studio Backdrop + Centered Glasses Frame */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-neutral-900 to-slate-950 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(26,58,138,0.2)_0%,transparent_100%)] pointer-events-none" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product?.images[0]?.url || '/demo/archetype_tortoise.png'}
              alt={product?.title || 'Active Frame'}
              className="w-64 h-auto object-contain z-10 pointer-events-none drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
            />
          </div>

          {/* Glare/Tint Overlay on Left Side (Uncoated/Outdoor) */}
          {activeSim === 'ar' ? (
            // AR Glare Reflection
            <div className="absolute inset-0 pointer-events-none z-20">
              {/* Main White Diagonal Glass Sheen */}
              <div
                className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent mix-blend-screen"
                style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
              />
              {/* Secondary Blue-Cyan Edge Reflective Flare */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/15 mix-blend-color-dodge"
                style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
              />
              <div
                className="absolute top-4 left-4 font-mono text-[9px] uppercase font-bold tracking-wider text-ink bg-white/95 px-2 py-0.5 rounded shadow-sm"
                style={{ opacity: sliderPos > 15 ? 1 : 0 }}
              >
                Standard Lens (Glare)
              </div>
            </div>
          ) : (
            // Photochromic Sunglasses Tint
            <div
              className="absolute inset-0 bg-emerald-950/40 mix-blend-multiply pointer-events-none transition-all duration-300 z-20"
              style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
            >
              {/* Secondary shading layer for glass look */}
              <div className="absolute inset-0 bg-slate-900/35" />
              <div
                className="absolute top-4 left-4 font-mono text-[9px] uppercase font-bold tracking-wider text-white bg-accent px-2 py-0.5 rounded shadow-sm"
                style={{ opacity: sliderPos > 15 ? 1 : 0 }}
              >
                Outdoor Sun (Tinted)
              </div>
            </div>
          )}

          {/* Right Side Info Tags (Premium AR / Indoor Clear) */}
          {activeSim === 'ar' ? (
            <div className="absolute inset-0 pointer-events-none z-25">
              <div
                className="absolute top-4 right-4 font-mono text-[9px] uppercase font-bold tracking-wider text-accent bg-white/95 px-2 py-0.5 rounded shadow-sm"
                style={{ opacity: (100 - sliderPos) > 15 ? 1 : 0 }}
              >
                Premium AR (Clear)
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 pointer-events-none z-25">
              <div
                className="absolute top-4 right-4 font-mono text-[9px] uppercase font-bold tracking-wider text-ink bg-white/95 px-2 py-0.5 rounded shadow-sm"
                style={{ opacity: (100 - sliderPos) > 15 ? 1 : 0 }}
              >
                Indoor Clear
              </div>
            </div>
          )}

          {/* Draggable Slider Bar */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-accent/80 cursor-ew-resize flex items-center justify-center z-30"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="w-6 h-6 rounded-full bg-accent border-2 border-white flex items-center justify-center shadow-lg text-white font-bold text-xs select-none">
              ↔
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-soft font-serif italic text-center mt-2">
          Drag the slider to preview the optical clarity improvement.
        </p>
      </div>

      {/* 2. Lens Index Advisor & Thickness Calculator */}
      <div className="border-t border-line pt-6">
        <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-3">
          Lens Index Advisor
        </p>

        {/* Prescription SPH Slider */}
        <div className="bg-base rounded-xl p-4 border border-line mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-sans text-muted">Your SPH Power:</span>
            <span className="font-mono text-sm font-bold text-accent">
              {sphPower > 0 ? `+${sphPower.toFixed(2)}` : sphPower.toFixed(2)} SPH
            </span>
          </div>
          <input
            type="range"
            min="-10.00"
            max="6.00"
            step="0.25"
            value={sphPower}
            onChange={(e) => setSphPower(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-line rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[9px] font-mono text-muted-soft mt-1">
            <span>-10.00 SPH</span>
            <span>0.00 SPH (Plano)</span>
            <span>+6.00 SPH</span>
          </div>
        </div>

        {/* Dynamic Graphic Simulation */}
        <div className="grid grid-cols-4 gap-3">
          {indexMaterials.map((mat) => {
            const isRec = mat.index === recommendedIndex;
            // Calculate lens curvature visualization
            // Curvature edge size scales with abs(sph) * mat.factor
            const magnitude = Math.max(0.5, absSph);
            const edgeThickness = 2 + magnitude * mat.factor * 1.5;
            const centerThickness = sphPower > 0 ? 2 + magnitude * mat.factor * 1.5 : 2;

            return (
              <div
                key={mat.name}
                className={`p-3 border rounded-xl flex flex-col justify-between transition-all ${
                  isRec
                    ? 'border-accent bg-accent/[0.02] shadow-sm ring-1 ring-accent'
                    : 'border-line bg-white hover:border-muted-soft'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-sans font-bold text-ink truncate leading-none">
                      {mat.name.split(' ')[0]}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-accent">
                      {mat.index}
                    </span>
                  </div>
                  <p className="text-[8px] text-muted-soft mt-1 leading-normal">
                    {mat.desc}
                  </p>
                </div>

                {/* SVG Lens Profile Cross-section */}
                <div className="my-4 h-10 flex items-center justify-center bg-base/50 rounded-lg p-1">
                  <svg width="50" height="30" viewBox="0 0 50 30" fill="none" className="overflow-visible">
                    {/* Lens Shape representing cross section */}
                    <path
                      d={
                        sphPower <= 0
                          ? // Concave lens (negative) - thicker edges, thin center
                            `M 5,${15 - edgeThickness} C 20,${15 - centerThickness} 30,${15 - centerThickness} 45,${15 - edgeThickness} L 45,${15 + edgeThickness} C 30,${15 + centerThickness} 20,${15 + centerThickness} 5,${15 + edgeThickness} Z`
                          : // Convex lens (positive) - thick center, thin edges
                            `M 5,${15 - centerThickness} C 20,${15 - edgeThickness} 30,${15 - edgeThickness} 45,${15 - centerThickness} L 45,${15 + centerThickness} C 30,${15 + edgeThickness} 20,${15 + edgeThickness} 5,${15 + centerThickness} Z`
                      }
                      fill="rgba(26, 58, 138, 0.15)"
                      stroke="#1a3a8a"
                      strokeWidth="1"
                    />
                  </svg>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-muted block">
                    Thickness: {Math.round(mat.factor * 100)}%
                  </span>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-ink">{mat.cost}</span>
                    {isRec && (
                      <span className="bg-accent text-white font-mono text-[7px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Rec
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
