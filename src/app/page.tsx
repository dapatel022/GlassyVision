import Hero from "@/components/Hero";
import FeatureSection from "@/components/FeatureSection";
import ProductShowcase from "@/components/ProductShowcase";
import Reviews from "@/components/Reviews";

export default function Home() {
  return (
    <div className="flex flex-col gap-0">
      <Hero />

      <FeatureSection
        title="New lenses for your frames."
        description="Replace the lenses in your favorite frames for a fraction of the cost of buying new glasses. We replace all types of lenses including single vision, progressives, sunglasses and more."
        ctaText="Replace Lenses"
        ctaLink="#"
        imagePosition="left"
      />

      <FeatureSection
        title="Shop smart glasses. The future is here."
        description="Get the latest in eyewear technology with our collection of smart glasses. Listen to music, take calls, and more, all from your frames."
        ctaText="Shop Smart Glasses"
        ctaLink="#"
        imagePosition="right"
        bgColor="bg-secondary"
      />

      <FeatureSection
        title="Buy all your favorite brands of contacts."
        description="We carry all major brands of contact lenses including Acuvue, Dailies, Biofinity and more. Price match guarantee and free shipping on all orders."
        ctaText="Shop Contacts"
        ctaLink="#"
        imagePosition="left"
      />

      <ProductShowcase />

      <FeatureSection
        title="Expired Rx? Renew your prescription online."
        description="Skip the trip to the doctor and renew your prescription from the comfort of your home. Our online vision test is fast, easy and approved by a doctor."
        ctaText="Renew Prescription"
        ctaLink="#"
        imagePosition="right"
        bgColor="bg-blue-50"
      />

      <Reviews />
    </div>
  );
}
