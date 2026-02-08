"use client";

import { useDraftActions } from "@/components/DraftActions";
import { createClient } from "@/lib/supabase/browser";
import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export default function AppShell({
  title = "Drillexpert",
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-base-bg text-base-ink">
      <AppTopbar
        title={title}
        subtitle={subtitle}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
      <AppLayout sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)}>
        {children}
      </AppLayout>
    </div>
  );
}

function AppTopbar({
  title,
  subtitle,
  sidebarOpen,
  onToggleSidebar,
}: {
  title?: string;
  subtitle?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
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
      if (!session?.user) {
        try {
          localStorage.setItem("tagesbericht_draft_block", "1");
          localStorage.removeItem("tagesbericht_draft");
        } catch (e) {
          console.warn("Failed to clear local draft on auth change", e);
        }
      } else {
        try {
          localStorage.removeItem("tagesbericht_draft_block");
        } catch (e) {
          console.warn("Failed to clear draft block on auth change", e);
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleLogout() {
    try {
      localStorage.setItem("tagesbericht_draft_block", "1");
      localStorage.removeItem("tagesbericht_draft");
    } catch (e) {
      console.warn("Failed to clear local draft on logout", e);
    }
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-base-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[2200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary lg:hidden"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Navigation schließen" : "Navigation öffnen"}
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
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

function AppLayout({
  children,
  sidebarOpen,
  onCloseSidebar,
}: {
  children: ReactNode;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  return (
    <div className="mx-auto grid max-w-[2200px] gap-6 px-4 sm:px-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <SidebarNav />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={onCloseSidebar}
          />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Navigation</div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCloseSidebar}
                aria-label="Navigation schließen"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav />
          </div>
        </div>
      )}

      <main className="min-w-0">
        <div className="bg-transparent p-4 sm:rounded-2xl sm:border sm:border-base-border sm:bg-white sm:p-6 sm:shadow-soft">
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
    <>
      <div className="lg:hidden">
        <div className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700">
          Meine Berichte
        </div>
        <div className="ml-2 mt-1 space-y-1">
          <SidebarLink href="/reports" label="Alle Berichte" />
          <SidebarLink href="/reports/new" label="Tagesbericht" />
          <SidebarLink href="/reports/schichtenverzeichnis/new" label="Schichtenverzeichnis" />
        </div>
      </div>

      <div className="group hidden lg:block">
        <Link
          href="/reports"
          className={[
            "block rounded-xl px-3 py-2 text-sm transition",
            active ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
          ].join(" ")}
        >
          Meine Berichte
        </Link>

        <div className="nav-subitems ml-2 mt-1 hidden space-y-1 lg:group-hover:block">
          <SidebarLink href="/reports/new" label="Tagesbericht" />
          <SidebarLink href="/reports/schichtenverzeichnis/new" label="Schichtenverzeichnis" />
        </div>
      </div>
    </>
  );
}

function SidebarNav() {
  return (
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
  );
}
