import { notFound } from "next/navigation";

import { ResourceTable } from "@/components/resources/ResourceTable";
import { requireSession } from "@/core/auth/session";
import { getResourceCapability } from "@/core/resources/capabilities-client";
import { getResourceListPage } from "@/core/resources/resource-list-client";

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ resourceName: string }>;
}) {
  await requireSession();
  const { resourceName } = await params;

  const capability = await getResourceCapability(resourceName);
  if (!capability || capability.view !== "table" || !capability.list) {
    notFound();
  }
  const list = capability.list;

  const page = await getResourceListPage(capability);
  if (!page) {
    notFound();
  }

  return <ResourceTable label={capability.label} list={list} page={page} />;
}
