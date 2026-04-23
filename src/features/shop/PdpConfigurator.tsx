'use client';

import { useState } from 'react';
import type { ShopifyProduct } from '@/lib/commerce/types';
import type { LensConfig } from '@/features/cart/types';
import { DEFAULT_LENS_CONFIG, lensDelta } from './lens-options';
import VariantPicker from './VariantPicker';
import LensPicker from './LensPicker';
import AddToCartButton from './AddToCartButton';

interface PdpConfiguratorProps {
  product: ShopifyProduct;
}

export default function PdpConfigurator({ product }: PdpConfiguratorProps) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [lensConfig, setLensConfig] = useState<LensConfig>(DEFAULT_LENS_CONFIG);

  const variant = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const framePrice = Number(variant?.price ?? product.price);
  const lensAdd = lensDelta(lensConfig);
  const totalPrice = framePrice + lensAdd;

  return (
    <div className="space-y-6">
      {product.variants.length > 1 && (
        <VariantPicker variants={product.variants} selectedId={variantId} onSelect={setVariantId} />
      )}

      <LensPicker value={lensConfig} onChange={setLensConfig} />

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
  );
}
