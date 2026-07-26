import CartClient from '@/features/cart/CartClient';
import { getBanners } from '@/lib/commerce/content';

export const revalidate = 900;

export const metadata = { title: 'Cart' };

export default async function CartPage() {
  const banners = await getBanners();
  return <CartClient banner={banners.cart?.[0] ?? null} />;
}
