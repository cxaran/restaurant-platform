import type { UserProfileRead } from "@/core/api/contracts";

import { AccountPasswordForm } from "./AccountPasswordForm";
import { AccountProfileForm } from "./AccountProfileForm";

/**
 * Editor de identidad PROPIA compartido por las tres superficies — público
 * (/cuenta/editar), empleado (/panel/cuenta) y admin (/admin/account): mismos
 * formularios y reglas (email rota sesión, contraseña con flujo seguro);
 * cada superficie solo aporta su cromo alrededor. Roles/permisos/estado
 * administrativo NUNCA se editan aquí.
 */
export function AccountEditor({ profile }: Readonly<{ profile: UserProfileRead }>) {
  return (
    <div className="space-y-6">
      <AccountProfileForm profile={profile} />
      <AccountPasswordForm />
    </div>
  );
}
