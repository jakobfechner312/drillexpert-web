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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2">
          {userEmail ? (
            <button
              onClick={handleLogout}
              className="rounded-xl border border-base-border bg-white px-3 py-2 text-sm hover:bg-base-bg"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-xl border border-base-border bg-white px-3 py-2 text-sm hover:bg-base-bg"
            >
              Login
            </Link>
          )}

          {/* ✅ Draft bleibt: ruft den Handler aus dem Form auf */}
          <button
            onClick={() => {
              console.log("[Entwurf] click");
              triggerSaveDraft();
            }}
            className="rounded-xl border border-base-border bg-white px-3 py-2 text-sm hover:bg-base-bg"
          >
            Entwurf
          </button>

          <button
            onClick={() => {
              console.log("[Report] click");
              triggerSaveReport();
            }}
            className="rounded-xl bg-drill-500 px-3 py-2 text-sm font-medium text-white hover:bg-drill-600"
          >
            PDF erzeugen
          </button>
        </div>
      </div>
    </header>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <nav className="rounded-2xl border border-base-border bg-white p-3 shadow-soft">
          <div className="mb-2 text-xs font-semibold text-base-muted">
            Navigation
          </div>

          <SidebarLink href="/projects" label="Projekte" />
          <SidebarLink href="/reports/new" label="Neuer Tagesbericht" />
          <SidebarLink href="/reports" label="Berichte" />
          <SidebarLink href="/drafts" label="Entwürfe" />
          <SidebarLink href="/settings" label="Einstellungen" />

          <div className="mt-4 rounded-xl bg-drill-50 p-3">
            <div className="text-sm font-semibold">Quick Tips</div>
            <div className="mt-1 text-xs text-base-muted">
              Speichere zwischendurch als Entwurf. Unterschriften erst am Ende.
            </div>
          </div>
        </nav>
      </aside>

      <main>
        <div className="rounded-2xl border border-base-border bg-white p-5 shadow-soft">
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