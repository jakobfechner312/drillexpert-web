"use client";

import { useDraftActions } from "@/components/DraftActions";
import { createClient } from "@/lib/supabase/browser";
import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export default function AppShell({
  title = "Drillexpert",
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base-bg text-base-ink">
      <AppTopbar title={title} subtitle={subtitle} />
      <AppLayout>{children}</AppLayout>
    </div>
  );
}

function AppTopbar({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const { triggerSaveDraft, triggerSaveReport } = useDraftActions();
  const pathname = usePathname();
  const isReportEditor =
    pathname.includes("/reports/") && (pathname.endsWith("/new") || pathname.includes("/edit"));

  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(data.user?.email ?? null);
      setAuthLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-base-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[2200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-10 w-40">
            <Image
              src="/drillexpert-logo.png"
              alt="Drillexpert"
              width={160}
              height={40}
              priority
              unoptimized
              className="object-contain"
            />
          </div>

          <div className="hidden sm:block">
            <div className="text-sm font-semibold">{title}</div>
            {subtitle ? (
              <div className="text-xs text-base-muted">{subtitle}</div>
            ) : null}

            <div className="mt-0.5 text-[11px] text-base-muted">
              {authLoading
                ? "Auth: lädt..."
                : userEmail
                ? `Eingeloggt: ${userEmail}`
                : "Nicht eingeloggt"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {userEmail ? (
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="btn btn-secondary"
            >
              Login
            </Link>
          )}

          {isReportEditor && (
            <>
              <button
                onClick={() => {
                  console.log("[Entwurf] click");
                  triggerSaveDraft();
                }}
                className="btn btn-secondary"
              >
                Entwurf
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={triggerSaveReport}
              >
                Speichern
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[2200px] gap-6 px-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="rounded-2xl border border-base-border bg-white p-3 shadow-soft">
          <div className="mb-2 text-xs font-semibold text-base-muted">
            Navigation
          </div>

          <SidebarLink href="/dashboard" label="Dashboard" />
          <SidebarLink href="/projects" label="Meine Projekte" />
          <SidebarReports />
          <SidebarLink href="/drafts" label="Meine Entwürfe" />
          <SidebarLink href="/settings" label="Einstellungen" />

          <div className="mt-4 rounded-xl bg-drill-50 p-3">
            <div className="text-sm font-semibold">Quick Tips</div>
            <div className="mt-1 text-xs text-base-muted">
              Speichere zwischendurch als Entwurf. Unterschriften erst am Ende.
            </div>
          </div>
        </nav>
      </aside>

      <main className="min-w-0">
        <div className="rounded-2xl border border-base-border bg-white p-5 sm:p-6 shadow-soft">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function SidebarReports() {
  const pathname = usePathname();
  const active = pathname.startsWith("/reports");

  return (
    <div className="group">
      <Link
        href="/reports"
        className={[
          "block rounded-xl px-3 py-2 text-sm transition",
          active ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
        ].join(" ")}
      >
        Meine Berichte
      </Link>

      <div className="ml-2 mt-1 hidden space-y-1 group-hover:block">
        <SidebarLink href="/reports/new" label="Tagesbericht" />
        <SidebarLink href="/reports/schichtenverzeichnis/new" label="Schichtenverzeichnis" />
      </div>
    </div>
  );
}
