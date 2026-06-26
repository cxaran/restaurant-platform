import { AccountMenu } from "@/components/layout/AccountMenu";
import type { ResourceCatalog as ResourceCatalogType } from "@/core/api/contracts";
import type { SessionUser } from "@/core/auth/types";

export function PlatformShell({
  session,
  resources,
  children,
}: Readonly<{
  session: SessionUser;
  resources: ResourceCatalogType;
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-slate-500">Platform Core</p>
            <h1 className="text-lg font-semibold">Panel</h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right text-sm">
              <p className="font-medium">{session.name}</p>
              <p className="text-slate-500">{session.email}</p>
            </div>
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Módulos disponibles</h2>
          <span className="text-sm text-slate-500">{resources.length}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
