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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
      <ProductGallery images={product.images} title={product.title} />

      <div>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
          Drop Nº 01
        </p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-2">
          {product.title}
        </h1>
        <p className="text-lg font-mono text-ink mb-6">
          ${Number(product.price).toFixed(0)} {product.currencyCode}
          <span className="text-sm text-muted-soft font-sans ml-2">frame only</span>
        </p>

        {product.description && (
          <p className="text-muted mb-8 font-serif leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        )}

        <PdpConfigurator product={product} />

        <p className="text-xs text-muted-soft mt-6 font-serif italic text-center">
          Rx required for single-vision or progressive lenses. Upload post-checkout.
        </p>
      </div>
    </div>
  );
}
