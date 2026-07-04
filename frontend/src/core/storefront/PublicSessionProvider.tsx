"use client";

// Adaptación del SessionProvider del panel: el sitio público admite visitantes
// SIN sesión (session: null). Reutiliza el mismo SessionUser generado y el
// mismo getSession() del servidor; solo cambia la nulabilidad del contexto.
import { createContext, useContext, type ReactNode } from "react";

import type { SessionUser } from "@/core/auth/types";

const PublicSessionContext = createContext<SessionUser | null>(null);

export function PublicSessionProvider({
  initialSession,
  children,
}: Readonly<{ initialSession: SessionUser | null; children: ReactNode }>) {
  return (
    <PublicSessionContext.Provider value={initialSession}>
      {children}
    </PublicSessionContext.Provider>
  );
}

export function usePublicSession(): SessionUser | null {
  return useContext(PublicSessionContext);
}
