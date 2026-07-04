"use client";

// Vista de configuración del negocio: cinco secciones independientes que
// consumen los contratos de /business/*. Cada sección carga y guarda por su
// cuenta; la edición completa requiere business:update (canEdit).

import { PhonesPanel } from "./PhonesPanel";
import { ProfileForm } from "./ProfileForm";
import { SettingsForm } from "./SettingsForm";
import { SpecialDatesPanel } from "./SpecialDatesPanel";
import { WeeklyHoursEditor } from "./WeeklyHoursEditor";

export function NegocioView({ canEdit }: Readonly<{ canEdit: boolean }>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ProfileForm canEdit={canEdit} />
      <SettingsForm canEdit={canEdit} />
      <PhonesPanel canEdit={canEdit} />
      <WeeklyHoursEditor canEdit={canEdit} />
      <SpecialDatesPanel canEdit={canEdit} />
    </div>
  );
}
