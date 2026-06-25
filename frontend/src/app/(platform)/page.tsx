import { ResourceCatalog } from "@/components/dashboard/ResourceCatalog";
import { getResourceCatalog } from "@/core/resources/capabilities-client";

export default async function DashboardPage() {
  const resources = await getResourceCatalog();

  return <ResourceCatalog resources={resources} />;
}
