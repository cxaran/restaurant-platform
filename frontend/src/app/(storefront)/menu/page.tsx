import { MenuView } from "@/components/storefront/MenuView";
import { getPublicBusiness, getPublicMenu } from "@/core/restaurant-api/business";

export const dynamic = "force-dynamic";

export default async function StorefrontMenuPage() {
  const [categories, business] = await Promise.all([getPublicMenu(), getPublicBusiness()]);
  return (
    <>
      <div className="sf-container" style={{ paddingTop: 26 }}>
        <h1 className="sf-display" style={{ fontSize: 32, margin: 0 }}>Menú</h1>
      </div>
      <MenuView categories={categories} creditsEnabled={business?.credits_enabled ?? true} />
    </>
  );
}
