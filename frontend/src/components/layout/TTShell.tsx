"use client";

import { useState } from "react";
import Link from "next/link";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export type TTShellNavItem = {
  key: string;
  href: string;
  label: string;
  active: boolean;
  badge?: string | number | null;
};

export type TTShellNavSection = {
  key: string;
  title?: string;
  items: TTShellNavItem[];
};

/**
 * Cromo compartido de los paneles internos (1g/1i/7b del handoff Tony-Tony):
 * sidebar café oscuro SIEMPRE (tokens --side-*) con marca arriba y usuario al
 * pie, header crema con el título en la fuente display, y contenido con scroll
 * propio sobre --bg. En móvil la sidebar es un drawer (clases .mc-sidebar).
 * Es PRESENTACIONAL: la navegación ya llega proyectada por permisos.
 */
export function TTShell({
  brand,
  sections,
  user,
  title,
  headerExtra,
  children,
}: Readonly<{
  brand: {
    homeHref: string;
    name: string;
    subtitle: string;
    logoUrl?: string | null;
  };
  sections: TTShellNavSection[];
  user: { name: string; detail: string };
  title: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  return (
    <div
      className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--tx)]"
      data-nav-open={navOpen ? "1" : "0"}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="mc-sidebar-backdrop fixed inset-0 z-30 bg-black/40"
        onClick={closeNav}
      />
      <aside className="mc-sidebar tt-shell-side z-40 flex w-[230px] shrink-0 flex-col bg-[var(--side-bg)] px-4 py-5 text-[var(--side-tx)]">
        <Link
          href={brand.homeHref}
          className="flex items-center gap-2.5 px-2 pb-4"
          onClick={closeNav}
        >
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- archivo dinámico servido por el backend
            <img src={brand.logoUrl} alt="" width={40} height={40} style={{ objectFit: "contain", flexShrink: 0 }} />
          ) : (
            <span
              aria-hidden
              className="tt-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--side-active)] text-lg text-[var(--side-active-tx)]"
            >
              {brand.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="tt-display truncate text-[15px] uppercase tracking-wide text-[var(--side-strong)]">
              {brand.name}
            </span>
            <span className="truncate text-[11px]">{brand.subtitle}</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Navegación">
          {sections.map((section) => (
            <div key={section.key}>
              {section.title ? (
                <p className="px-3.5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-[var(--side-tx2)]">
                  {section.title}
                </p>
              ) : null}
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={closeNav}
                  className={`mb-1 flex items-center justify-between rounded-[12px] px-3.5 py-3 text-sm transition ${
                    item.active
                      ? "bg-[var(--side-active)] font-extrabold text-[var(--side-active-tx)]"
                      : "font-semibold hover:bg-white/5 hover:text-[var(--side-strong)]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge != null && item.badge !== "" ? (
                    <span className="ml-2 shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-xs font-bold">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--side-border)] px-2 pt-4">
          <div className="min-w-0 text-sm">
            <p className="truncate text-[13px] font-bold text-[var(--side-strong)]">{user.name}</p>
            <p className="truncate text-xs">{user.detail}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="tt-shell-header flex min-h-[66px] shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--header-bg)] px-4 sm:px-7">
          <button
            type="button"
            className="mc-menu-btn h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border2)] text-[var(--tx2)]"
            aria-label="Abrir navegación"
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>
          {/* Título del cromo, NO un heading: cada página aporta su propio h1/h2. */}
          <p className="tt-display truncate text-[22px]">{title}</p>
          {headerExtra ? (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">{headerExtra}</div>
          ) : null}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
