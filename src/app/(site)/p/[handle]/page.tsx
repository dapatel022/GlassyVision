import { notFound } from 'next/navigation';
import { getProductByHandle } from '@/lib/commerce/shopify';
import ProductGallery from '@/features/shop/ProductGallery';
import PdpConfigurator from '@/features/shop/PdpConfigurator';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ handle: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { handle } = await params;
  let product;
  try {
    product = await getProductByHandle(handle);
  } catch {
    product = null;
  }
  if (!product) notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: Product Gallery (Sticky) */}
        <div className="lg:col-span-7 lg:sticky lg:top-24">
          <ProductGallery images={product.images} title={product.title} />
        </div>

        {/* Right: Product Configurator & Info */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent mb-2 animate-pulse">
              Drop Nº 01 · Limited Edition
            </p>
            <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-1">
              {product.title}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-xl font-mono font-bold text-ink">
                ${Number(product.price).toFixed(0)} {product.currencyCode}
              </p>
              <span className="text-xs text-muted-soft font-serif italic border-l border-line pl-3">
                frame only
              </span>
            </div>
          </div>

          {product.description && (
            <p className="text-muted font-serif leading-relaxed text-base">
              {product.description}
            </p>
          )}

          {/* Configurator Wizard */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm">
            <PdpConfigurator product={product} />
          </div>

          {/* Technical Specs Detail Table */}
          <div className="border border-line rounded-xl p-4 bg-white/70 space-y-3">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink border-b border-line pb-2">
              Frame Sizing & Build Specifications
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-xs font-mono">
              <span className="text-muted-soft uppercase">Eye Diameter</span>
              <span className="text-ink text-right font-bold">{product.metafields?.find(m => m.key === 'frame_eye_size')?.value || '48'} mm</span>
              <span className="text-muted-soft uppercase border-t border-line/40 pt-1.5">Bridge Size</span>
              <span className="text-ink text-right font-bold border-t border-line/40 pt-1.5">{product.metafields?.find(m => m.key === 'frame_bridge')?.value || '21'} mm</span>
              <span className="text-muted-soft uppercase border-t border-line/40 pt-1.5">Temple Length</span>
              <span className="text-ink text-right font-bold border-t border-line/40 pt-1.5">{product.metafields?.find(m => m.key === 'frame_temple_length')?.value || '145'} mm</span>
              <span className="text-muted-soft uppercase border-t border-line/40 pt-1.5">Material</span>
              <span className="text-ink text-right font-bold border-t border-line/40 pt-1.5">{product.handle.includes('linear') ? 'Pure Titanium' : 'Cellulose Acetate'}</span>
              <span className="text-muted-soft uppercase border-t border-line/40 pt-1.5">Rx Capability</span>
              <span className="text-accent text-right font-bold border-t border-line/40 pt-1.5">Prescription Capable</span>
            </div>
          </div>

          <p className="text-[10px] text-muted-soft font-serif italic text-center">
            Upload prescription post-checkout or skip to submit values manually.
          </p>
        </div>
      </div>
    </div>
  );
}
