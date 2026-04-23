export type LensType = 'non_rx' | 'single_vision' | 'progressive';

export interface LensConfig {
  lensType: LensType;
  coatings: string[];
  tint: string;
}

export interface CartLine {
  productId: string;
  variantId: string;
  productHandle: string;
  title: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lensConfig: LensConfig;
}
