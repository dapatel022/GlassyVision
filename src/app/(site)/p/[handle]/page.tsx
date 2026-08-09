import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductByHandle } from '@/lib/commerce/shopify';
import { getLensUpgradePricing } from '@/lib/commerce/lens-pricing';
import { getBanners } from '@/lib/commerce/content';
import ProductGallery from '@/features/shop/ProductGallery';
import PdpConfigurator from '@/features/shop/PdpConfigurator';
import PromoBanner from '@/components/site/PromoBanner';
import FitDimensionBar from '@/features/shop/components/FitDimensionBar';
import UnboxingTrustModule from '@/features/shop/components/UnboxingTrustModule';
import BatchScarcityBadge from '@/features/shop/components/BatchScarcityBadge';
import MembershipMathLine from '@/features/subscriptions/components/MembershipMathLine';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  let product = null;
  try {
    product = await getProductByHandle(handle);
  } catch {
    product = null;
  }
  if (!product) {
    return { title: 'Product not found · GlassyVision' };
  }

  const description = (product.description || `${product.title} — prescription-ready eyewear from GlassyVision.`).slice(0, 160);
  const image = product.images?.[0]?.url;
  return {
    title: `${product.title} · GlassyVision`,
    description,
    openGraph: {
      title: product.title,
      description,
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
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

  const pdpBanner = (await getBanners()).pdp?.[0];
  // Live Shopify prices for lens upgrades; null → configurator fails closed.
  const lensPricing = await getLensUpgradePricing();

  const eyeWidth = Number(product.metafields?.find(m => m.key === 'frame_eye_size')?.value || 48);
  const bridgeWidth = Number(product.metafields?.find(m => m.key === 'frame_bridge')?.value || 21);
  const templeLength = Number(product.metafields?.find(m => m.key === 'frame_temple_length')?.value || 145);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: Product Gallery (Sticky) */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-6">
          <ProductGallery images={product.images} title={product.title} />

          {/* Architectural Fit & Dimension Bar */}
          <FitDimensionBar
            lensWidth={eyeWidth}
            bridgeWidth={bridgeWidth}
            templeLength={templeLength}
            fitRating="Medium / Universal"
          />
        </div>

        {/* Right: Product Configurator & Info */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="mb-3">
              <BatchScarcityBadge dropNumber="01" totalAllocation={500} allocatedCount={342} />
            </div>
            <h1 className="font-sans text-4xl sm:text-5xl font-black tracking-tight uppercase text-ink mb-2">
              {product.title}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-mono font-black text-ink">
                ${Number(product.price).toFixed(0)} {product.currencyCode}
              </p>
              <span className="text-xs text-muted-soft font-serif italic border-l border-line pl-3">
                frame + standard lenses
              </span>
            </div>
            <MembershipMathLine productHandle={handle} productPrice={Number(product.price)} />
          </div>

          {product.description && (
            <p className="text-muted font-serif leading-relaxed text-base">
              {product.description}
            </p>
          )}

          {/* Configurator Wizard */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm">
            <PdpConfigurator product={product} lensPricing={lensPricing} />
          </div>

          {/* Unboxing Experience & Trust Guarantees */}
          <UnboxingTrustModule />

          {pdpBanner && <PromoBanner banner={pdpBanner} />}
        </div>
      </div>
    </div>
  );
}
