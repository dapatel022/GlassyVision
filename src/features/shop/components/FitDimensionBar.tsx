'use client';

interface FitDimensionBarProps {
  lensWidth?: number;
  bridgeWidth?: number;
  templeLength?: number;
  lensHeight?: number;
  fitRating?: 'Narrow' | 'Medium / Universal' | 'Wide';
}

export default function FitDimensionBar({
  lensWidth = 48,
  bridgeWidth = 21,
  templeLength = 145,
  lensHeight = 44,
  fitRating = 'Medium / Universal',
}: FitDimensionBarProps) {
  const totalFrameWidth = lensWidth * 2 + bridgeWidth + 8; // approx outer frame width

  return (
    <div className="border border-line rounded-2xl p-5 bg-white/80 backdrop-blur shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-line/60 pb-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-accent">
          Architectural Sizing & Fit
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-accent/10 border border-accent/20 text-accent rounded-full">
          {fitRating} Fit
        </span>
      </div>

      {/* Dimension Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-base/60 border border-line/80 rounded-xl p-2.5 space-y-1">
          <span className="font-mono text-[9px] text-muted-soft uppercase block font-bold">Lens</span>
          <p className="font-mono text-sm font-bold text-ink">{lensWidth}<span className="text-[10px] text-muted-soft">mm</span></p>
        </div>
        <div className="bg-base/60 border border-line/80 rounded-xl p-2.5 space-y-1">
          <span className="font-mono text-[9px] text-muted-soft uppercase block font-bold">Bridge</span>
          <p className="font-mono text-sm font-bold text-ink">{bridgeWidth}<span className="text-[10px] text-muted-soft">mm</span></p>
        </div>
        <div className="bg-base/60 border border-line/80 rounded-xl p-2.5 space-y-1">
          <span className="font-mono text-[9px] text-muted-soft uppercase block font-bold">Height</span>
          <p className="font-mono text-sm font-bold text-ink">{lensHeight}<span className="text-[10px] text-muted-soft">mm</span></p>
        </div>
        <div className="bg-base/60 border border-line/80 rounded-xl p-2.5 space-y-1">
          <span className="font-mono text-[9px] text-muted-soft uppercase block font-bold">Temple</span>
          <p className="font-mono text-sm font-bold text-ink">{templeLength}<span className="text-[10px] text-muted-soft">mm</span></p>
        </div>
      </div>

      {/* Frame Sizing Visual Diagram */}
      <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-muted-soft border-t border-line/60">
        <span>TOTAL FRAME WIDTH: <strong className="text-ink">{totalFrameWidth}mm</strong></span>
        <span className="text-accent font-bold">✓ Suitable for 95% of Face Shapes</span>
      </div>
    </div>
  );
}
