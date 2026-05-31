'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ShopifyImage } from '@/lib/commerce/types';

interface ProductGalleryProps {
  images: ShopifyImage[];
  title: string;
}

export default function ProductGallery({ images, title }: ProductGalleryProps) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-base-deeper rounded-xl flex items-center justify-center">
        <p className="text-muted-soft font-serif italic">No images yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square bg-base-deeper rounded-xl overflow-hidden mb-4">
        <Image
          src={images[active].url}
          alt={images[active].altText || title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setActive(i)}
              className={`relative aspect-square bg-base-deeper rounded-lg overflow-hidden border-2 ${
                i === active ? 'border-accent' : 'border-transparent'
              }`}
            >
              <Image src={img.url} alt="" fill sizes="10vw" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
