'use client';

export default function UnboxingTrustModule() {
  return (
    <div className="space-y-6 pt-6 border-t border-line">
      {/* 4 Quiet Luxury Trust Badges */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2.5 p-3 bg-white border border-line rounded-xl shadow-2xs">
          <span className="text-base flex-none">✈️</span>
          <div>
            <p className="font-sans font-bold text-[11px] text-ink uppercase leading-tight">Express Delivery</p>
            <p className="font-mono text-[9px] text-muted-soft">Free to US & Canada</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 bg-white border border-line rounded-xl shadow-2xs">
          <span className="text-base flex-none">🩺</span>
          <div>
            <p className="font-sans font-bold text-[11px] text-ink uppercase leading-tight">Lab Rx Guarantee</p>
            <p className="font-mono text-[9px] text-muted-soft">100% Prescription Accuracy</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 bg-white border border-line rounded-xl shadow-2xs">
          <span className="text-base flex-none">🛡️</span>
          <div>
            <p className="font-sans font-bold text-[11px] text-ink uppercase leading-tight">1-Year Warranty</p>
            <p className="font-mono text-[9px] text-muted-soft">Frame & Scratch Protection</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-3 bg-white border border-line rounded-xl shadow-2xs">
          <span className="text-base flex-none">🔄</span>
          <div>
            <p className="font-sans font-bold text-[11px] text-ink uppercase leading-tight">Easy Returns</p>
            <p className="font-mono text-[9px] text-muted-soft">30-Day Hassle Free</p>
          </div>
        </div>
      </div>

      {/* What's In The Box Breakdown */}
      <div className="bg-ink text-white rounded-2xl p-5 border border-line/80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-accent-light">
            Unboxing Experience
          </span>
          <span className="font-mono text-[9px] text-gray-400 uppercase">INCLUDED WITH EVERY PAIR</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <div className="p-2 bg-white/5 rounded-lg border border-white/10 space-y-1">
            <span className="text-sm block">🧳</span>
            <p className="font-sans text-[10px] font-bold uppercase text-white">Leather Case</p>
            <p className="font-mono text-[8px] text-gray-400">Custom Hardfold</p>
          </div>
          <div className="p-2 bg-white/5 rounded-lg border border-white/10 space-y-1">
            <span className="text-sm block">✨</span>
            <p className="font-sans text-[10px] font-bold uppercase text-white">Microfiber</p>
            <p className="font-mono text-[8px] text-gray-400">High-Density Cloth</p>
          </div>
          <div className="p-2 bg-white/5 rounded-lg border border-white/10 space-y-1">
            <span className="text-sm block">📜</span>
            <p className="font-sans text-[10px] font-bold uppercase text-white">Certificate</p>
            <p className="font-mono text-[8px] text-gray-400">Batch Stamped</p>
          </div>
        </div>
      </div>

      {/* Upload Rx Later Assurance Banner */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-3.5 flex items-start gap-3">
        <span className="text-accent text-sm mt-0.5">ℹ️</span>
        <div className="space-y-0.5">
          <p className="font-sans font-bold text-xs text-ink uppercase">Don&apos;t Have Your Prescription Ready?</p>
          <p className="font-serif italic text-xs text-muted leading-snug">
            Complete your order today. You can upload your prescription image anytime from your email confirmation link or customer portal.
          </p>
        </div>
      </div>
    </div>
  );
}
