import { PlatformShell } from "@/components/layout/PlatformShell";
import { SessionProvider } from "@/core/auth/SessionProvider";
import { requireSession } from "@/core/auth/session";
import { getResourceCatalog } from "@/core/resources/capabilities-client";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const resources = await getResourceCatalog();

  return (
    <SessionProvider initialSession={session}>
      <PlatformShell session={session} resources={resources}>
        {children}
      </PlatformShell>
    </SessionProvider>
  );
}
