'use client';

import { useState } from 'react';
import type { ShopifyProduct } from '@/lib/commerce/types';
import type { LensConfig, LensType } from '@/features/cart/types';
import VariantPicker from './VariantPicker';
import AddToCartButton from './AddToCartButton';
import VirtualTryOn from './VirtualTryOn';
import LensAdvisor from './LensAdvisor';

interface PdpConfiguratorProps {
  product: ShopifyProduct;
}

type WizardStep = 'frame' | 'lens-type' | 'customize';
type LensCategory = 'clear_rx' | 'sun_rx' | 'blue_light_non_rx' | 'demo_only';

export default function PdpConfigurator({ product }: PdpConfiguratorProps) {
  const [step, setStep] = useState<WizardStep>('frame');
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [isVtoOpen, setIsVtoOpen] = useState(false);

  // High-level lens category selection
  const [category, setCategory] = useState<LensCategory>('clear_rx');

  // Low-level LensConfig state mapped from category selection
  const [lensConfig, setLensConfig] = useState<LensConfig>({
    lensType: 'single_vision',
    coatings: ['ar'],
    tint: 'none',
  });

  const variant = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const framePrice = Number(variant?.price ?? product.price);
  // The cart charges the Shopify frame-variant price only. Lens upgrades are not
  // yet represented as Shopify products, so we MUST NOT add (or display) deltas
  // the checkout will never collect — doing so showed the customer a higher price
  // than Shopify charged (2026-06-12 audit C5). Re-introduce per-upgrade pricing
  // once lens add-on products exist in Shopify and are added as cart line items.
  const totalPrice = framePrice;

  // Handle category change and map to LensConfig
  function handleCategoryChange(cat: LensCategory) {
    setCategory(cat);
    if (cat === 'clear_rx') {
      setLensConfig({
        lensType: 'single_vision',
        coatings: ['ar'],
        tint: 'none',
      });
    } else if (cat === 'sun_rx') {
      setLensConfig({
        lensType: 'single_vision',
        coatings: ['ar'],
        tint: 'green',
      });
    } else if (cat === 'blue_light_non_rx') {
      setLensConfig({
        lensType: 'non_rx',
        coatings: ['blue_light'],
        tint: 'none',
      });
    } else {
      setLensConfig({
        lensType: 'non_rx',
        coatings: [],
        tint: 'none',
      });
    }
  }

  function handleLensTypeChange(t: LensType) {
    setLensConfig(prev => ({ ...prev, lensType: t }));
  }

  function handleTintChange(t: 'none' | 'grey' | 'amber' | 'green') {
    setLensConfig(prev => ({ ...prev, tint: t }));
  }

  function toggleCoating(c: string) {
    setLensConfig(prev => {
      const has = prev.coatings.includes(c);
      return {
        ...prev,
        coatings: has ? prev.coatings.filter(x => x !== c) : [...prev.coatings, c]
      };
    });
  }

  return (
    <div className="space-y-6 select-none text-left">
      {/* Wizard Steps Indicator */}
      <div role="tablist" aria-label="Configurator steps" className="flex border-b border-line pb-4 justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-muted-soft">
        <button
          role="tab"
          aria-selected={step === 'frame'}
          onClick={() => setStep('frame')}
          className={`pb-1 ${step === 'frame' ? 'border-b border-accent text-accent' : 'hover:text-ink'}`}
        >
          1. Frame Fit
        </button>
        <button
          role="tab"
          aria-selected={step === 'lens-type'}
          onClick={() => setStep('lens-type')}
          className={`pb-1 ${step === 'lens-type' ? 'border-b border-accent text-accent' : 'hover:text-ink'}`}
        >
          2. Lens Choice
        </button>
        <button
          role="tab"
          aria-selected={step === 'customize'}
          onClick={() => setStep('customize')}
          className={`pb-1 ${step === 'customize' ? 'border-b border-accent text-accent' : 'hover:text-ink'}`}
        >
          3. Customization
        </button>
      </div>

      {/* STEP 1: Color, Size & VTO */}
      {step === 'frame' && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="flex items-center gap-2 justify-between">
            <h4 className="font-mono text-xs font-bold uppercase text-ink">Choose Frame Specs</h4>
            <button
              type="button"
              onClick={() => setIsVtoOpen(true)}
              className="text-xs text-accent font-bold uppercase hover:underline flex items-center gap-1.5"
            >
              <span aria-hidden="true">🕶️</span> Try-On Live
            </button>
          </div>

          {product.variants.length > 1 && (
            <VariantPicker variants={product.variants} selectedId={variantId} onSelect={setVariantId} />
          )}

          <div className="bg-base rounded-xl p-3 border border-line flex justify-between items-center text-xs font-mono">
            <span className="text-muted-soft">TEMPLE FIT:</span>
            <span className="font-bold text-ink">
              {product.handle.includes('linear') ? 'Light titanium fit' : 'Cellulose Acetate classic'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setStep('lens-type')}
            className="w-full py-3 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition-colors"
          >
            Configure Lenses →
          </button>
        </div>
      )}

      {/* STEP 2: Choose Lens Category */}
      {step === 'lens-type' && (
        <div className="space-y-4 animate-fade-in-up">
          <h4 className="font-mono text-xs font-bold uppercase text-ink">Select Lens Intent</h4>
          <div className="space-y-2.5">
            {/* Category Cards */}
            <button
              onClick={() => handleCategoryChange('clear_rx')}
              aria-pressed={category === 'clear_rx'}
              className={`w-full p-4 border rounded-xl text-left transition-all flex flex-col justify-between ${
                category === 'clear_rx' ? 'border-accent bg-accent/[0.02] ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <div className="flex justify-between items-center w-full">
                <span className="font-sans font-bold text-sm text-ink uppercase tracking-wide">
                  Clear Prescription Lenses
                </span>
                <span className="bg-accent text-white font-mono text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-muted-soft mt-1 leading-normal">
                Single-vision or Progressive prescription clear lenses. Hand-finished.
              </p>
            </button>

            <button
              onClick={() => handleCategoryChange('sun_rx')}
              aria-pressed={category === 'sun_rx'}
              className={`w-full p-4 border rounded-xl text-left transition-all flex flex-col justify-between ${
                category === 'sun_rx' ? 'border-accent bg-accent/[0.02] ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <span className="font-sans font-bold text-sm text-ink uppercase tracking-wide">
                Prescription Sunglasses
              </span>
              <p className="text-xs text-muted-soft mt-1 leading-normal">
                Tinted, Polarized, or Transitions lenses configured with your prescription details.
              </p>
            </button>

            <button
              onClick={() => handleCategoryChange('blue_light_non_rx')}
              aria-pressed={category === 'blue_light_non_rx'}
              className={`w-full p-4 border rounded-xl text-left transition-all flex flex-col justify-between ${
                category === 'blue_light_non_rx' ? 'border-accent bg-accent/[0.02] ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <span className="font-sans font-bold text-sm text-ink uppercase tracking-wide">
                Blue Light Screen Glasses
              </span>
              <p className="text-xs text-muted-soft mt-1 leading-normal">
                No prescription required. Multi-coat anti-blue-light filter lenses.
              </p>
            </button>

            <button
              onClick={() => handleCategoryChange('demo_only')}
              aria-pressed={category === 'demo_only'}
              className={`w-full p-4 border rounded-xl text-left transition-all flex flex-col justify-between ${
                category === 'demo_only' ? 'border-accent bg-accent/[0.02] ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <span className="font-sans font-bold text-sm text-ink uppercase tracking-wide">
                Frame Only (Clear Demo Lenses)
              </span>
              <p className="text-xs text-muted-soft mt-1 leading-normal">
                Shipped with clear non-prescription demo lenses. No added cost.
              </p>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('frame')}
              className="flex-1 py-3 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-base-deeper transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep('customize')}
              className="flex-1 py-3 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition-colors"
            >
              Next Step →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Customize Options & Add Advisor */}
      {step === 'customize' && (
        <div className="space-y-6 animate-fade-in-up">
          <h4 className="font-mono text-xs font-bold uppercase text-ink">Customize Lens Upgrades</h4>

          {/* Rx Customizations */}
          {(category === 'clear_rx' || category === 'sun_rx') && (
            <div className="space-y-4">
              {/* Lens type */}
              <div>
                <p className="text-[10px] font-mono uppercase text-muted-soft font-bold mb-2">Rx Lens Type</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleLensTypeChange('single_vision')}
                    aria-pressed={lensConfig.lensType === 'single_vision'}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      lensConfig.lensType === 'single_vision' ? 'border-accent bg-accent/5 font-bold' : 'border-line hover:border-accent'
                    }`}
                  >
                    <p className="text-xs text-ink uppercase">Single Vision</p>
                  </button>
                  <button
                    onClick={() => handleLensTypeChange('progressive')}
                    aria-pressed={lensConfig.lensType === 'progressive'}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      lensConfig.lensType === 'progressive' ? 'border-accent bg-accent/5 font-bold' : 'border-line hover:border-accent'
                    }`}
                  >
                    <p className="text-xs text-ink uppercase">Progressive</p>
                  </button>
                </div>
              </div>

              {/* Tint options for Sunglasses */}
              {category === 'sun_rx' && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-muted-soft font-bold mb-2">Sun Tint Color</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['green', 'grey', 'amber'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => handleTintChange(t)}
                        aria-pressed={lensConfig.tint === t}
                        className={`p-2.5 border rounded-lg text-center transition-colors capitalize ${
                          lensConfig.tint === t ? 'border-accent bg-accent/5 font-bold' : 'border-line hover:border-accent'
                        }`}
                      >
                        <span className="text-xs text-ink">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Coatings toggling */}
              <div>
                <p className="text-[10px] font-mono uppercase text-muted-soft font-bold mb-2">Coatings & Protection</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleCoating('ar')}
                    aria-pressed={lensConfig.coatings.includes('ar')}
                    className={`p-3 border rounded-lg text-left transition-colors flex justify-between items-center ${
                      lensConfig.coatings.includes('ar') ? 'border-accent bg-accent/5 font-bold' : 'border-line hover:border-accent'
                    }`}
                  >
                    <span className="text-xs text-ink uppercase">Anti-Reflective</span>
                  </button>
                  <button
                    onClick={() => toggleCoating('photochromic')}
                    aria-pressed={lensConfig.coatings.includes('photochromic')}
                    className={`p-3 border rounded-lg text-left transition-colors flex justify-between items-center ${
                      lensConfig.coatings.includes('photochromic') ? 'border-accent bg-accent/5 font-bold' : 'border-line hover:border-accent'
                    }`}
                  >
                    <span className="text-xs text-ink uppercase">Transitions</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {category === 'blue_light_non_rx' && (
            <div className="p-4 bg-base rounded-xl border border-line text-xs font-mono text-muted space-y-1">
              <p className="font-bold text-accent">BLUE LIGHT COATING ACTIVE</p>
              <p>Protects eyes from digital screen glare. Non-prescription.</p>
            </div>
          )}

          {category === 'demo_only' && (
            <div className="p-4 bg-base rounded-xl border border-line text-xs font-mono text-muted space-y-1">
              <p className="font-bold text-ink">DEMO LENSES SHIPPED</p>
              <p>Simple clear acrylic demo lenses. Frame only.</p>
            </div>
          )}

          {/* Interactive virtual visual advisor drawer */}
          {(category === 'clear_rx' || category === 'sun_rx') && (
            <div className="border-t border-line pt-4 space-y-3">
              <p className="text-[10px] font-mono uppercase text-muted-soft font-bold">Interactive Lens Advisor</p>
              <LensAdvisor product={product} />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('lens-type')}
              className="flex-1 py-3 border border-line text-ink font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-base-deeper transition-colors"
            >
              ← Back
            </button>
            <div className="flex-2">
              <AddToCartButton
                line={{
                  productId: product.id,
                  variantId: variant?.id ?? product.id,
                  productHandle: product.handle,
                  title: product.title,
                  image: product.images[0]?.url ?? null,
                  unitPrice: totalPrice,
                }}
                lensConfig={lensConfig}
                totalPrice={totalPrice}
              />
            </div>
          </div>
        </div>
      )}

      {/* VTO Modal overlay */}
      <VirtualTryOn
        isOpen={isVtoOpen}
        onClose={() => setIsVtoOpen(false)}
        product={product}
      />
    </div>
  );
}
