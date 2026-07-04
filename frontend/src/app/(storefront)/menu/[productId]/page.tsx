import { notFound } from "next/navigation";

import { ProductDetail } from "@/components/storefront/ProductDetail";
import { getPublicMenu } from "@/core/restaurant-api/business";

export const dynamic = "force-dynamic";

// Página de detalle de producto (diseño 1b). No existe endpoint público de
// producto por id en el contrato: el producto se resuelve desde el menú
// público completo (/api/v1/public/menu); si no está publicado → 404.
export default async function StorefrontProductPage({
  params,
}: Readonly<{ params: Promise<{ productId: string }> }>) {
  const { productId } = await params;
  const categories = await getPublicMenu();
  const product = categories
    .flatMap((category) => category.products)
    .find((item) => item.id === productId);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
