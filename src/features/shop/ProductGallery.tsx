'use client';

import { useState } from 'react';
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
      <div className="aspect-square bg-base-deeper rounded-xl overflow-hidden mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[active].url}
          alt={images[active].altText || title}
          className="w-full h-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setActive(i)}
              className={`aspect-square bg-base-deeper rounded-lg overflow-hidden border-2 ${
                i === active ? 'border-accent' : 'border-transparent'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
