"use client";

import { useDraftActions } from "@/components/DraftActions";
import { createClient } from "@/lib/supabase/browser";
import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

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
  const [topbarHiddenMobile, setTopbarHiddenMobile] = useState(false);
  const showFloatingNavToggle = pathname.startsWith("/reports");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarOpen(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let lastY = 0;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const mobile = window.innerWidth < 1024;
        if (!mobile) {
          setTopbarHiddenMobile(false);
          lastY = y;
          ticking = false;
          return;
        }

        if (y <= 16) {
          setTopbarHiddenMobile(false);
          lastY = y;
          ticking = false;
          return;
        }

        const delta = y - lastY;
        if (delta > 8 && y > 80) {
          setTopbarHiddenMobile(true);
        } else if (delta < -8) {
          setTopbarHiddenMobile(false);
        }

        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-base-bg text-base-ink">
      <AppTopbar
        title={title}
        subtitle={subtitle}
        sidebarOpen={sidebarOpen}
        topbarHiddenMobile={topbarHiddenMobile}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
      <AppLayout sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)}>
        {children}
      </AppLayout>
      {showFloatingNavToggle && !sidebarOpen ? (
        <button
          type="button"
          className="fixed left-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-base-border bg-white/95 p-2.5 text-slate-700 shadow-lg backdrop-blur transition hover:bg-white lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="Navigation öffnen"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function AppTopbar({
  title,
  subtitle,
  sidebarOpen,
  topbarHiddenMobile,
  onToggleSidebar,
}: {
  title?: string;
  subtitle?: string;
  sidebarOpen: boolean;
  topbarHiddenMobile: boolean;
  onToggleSidebar: () => void;
}) {
  const { triggerSaveDraft, triggerSaveReport } = useDraftActions();
  const pathname = usePathname();
  const isReportEditor =
    pathname.includes("/reports/new") ||
    pathname.includes("/reports/schichtenverzeichnis/new") ||
    pathname.includes("/edit");

  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(data.user?.email ?? null);
      if (data.user?.id) {
        try {
          await supabase
            .from("profiles")
            .upsert({ id: data.user.id, email: data.user.email ?? null }, { onConflict: "id" });
        } catch (e) {
          console.warn("Failed to upsert profile email", e);
        }
      }
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
        if (session.user?.id) {
          void (async () => {
            try {
              await supabase
                .from("profiles")
                .upsert({ id: session.user.id, email: session.user.email ?? null }, { onConflict: "id" });
            } catch (e) {
              console.warn("Failed to upsert profile email", e);
            }
          })();
        }
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
    <header
      className={[
        "sticky top-0 z-50 border-b border-base-border bg-white/80 backdrop-blur transition-transform duration-300",
        topbarHiddenMobile ? "-translate-y-full lg:translate-y-0" : "translate-y-0",
      ].join(" ")}
    >
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
                className="btn btn-secondary hidden sm:inline-flex"
              >
                Entwurf
              </button>

              <button
                type="button"
                className="btn btn-primary hidden sm:inline-flex"
                onClick={triggerSaveReport}
              >
                Speichern
              </button>
            </>
          )}
        </div>
      </div>
      {isReportEditor ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-base-border bg-white/95 px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-[2200px] items-center gap-2">
            <button
              type="button"
              onClick={() => {
                console.log("[Entwurf] click");
                triggerSaveDraft();
              }}
              className="btn btn-secondary flex-1 justify-center"
            >
              Entwurf
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1 justify-center"
              onClick={triggerSaveReport}
            >
              Speichern
            </button>
          </div>
        </div>
      ) : null}
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
        <div className="mt-2 bg-transparent p-4 pt-6 pb-24 sm:mt-0 sm:rounded-2xl sm:border sm:border-base-border sm:bg-white sm:p-6 sm:pb-6 sm:shadow-soft">
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

type SidebarProjectItem = {
  id: string;
  name: string;
  project_number: string | null;
  status?: string | null;
};

function SidebarProjects() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<SidebarProjectItem[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = pathname.startsWith("/projects");

  useEffect(() => {
    let mounted = true;
    const loadProjects = async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) {
        if (mounted) setProjects([]);
        return;
      }

      const { data, error } = await supabase
        .from("project_members")
        .select("project:projects(id,name,project_number,status,created_at)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false, referencedTable: "projects" });

      if (error || !mounted) return;

      const rows = (data ?? []) as Array<{
        project?: {
          id?: string | null;
          name?: string | null;
          project_number?: string | null;
          status?: string | null;
        } | null;
      }>;

      const mapped = rows
        .map((row) => ({
          id: row.project?.id ?? "",
          name: row.project?.name ?? "",
          project_number: row.project?.project_number ?? null,
          status: row.project?.status ?? null,
        }))
        .filter((row) => Boolean(row.id) && row.status !== "archived")
        .slice(0, 12);

      setProjects(mapped);
    };

    loadProjects();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const formatProjectLabel = (project: SidebarProjectItem) => {
    const nr = (project.project_number ?? "").trim();
    const name = (project.name ?? "").trim();
    if (nr && name) return `${nr} - ${name}`;
    return name || nr || "Projekt";
  };

  const renderProjectLinks = (className = "") => (
    <div className={className}>
      <SidebarLink href="/projects" label="Alle Projekte" />
      {projects.length > 0 ? (
        <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
          {projects.map((project) => {
            const href = `/projects/${project.id}`;
            const projectActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={project.id}
                href={href}
                className={[
                  "block rounded-xl px-3 py-2 text-sm transition",
                  projectActive ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
                ].join(" ")}
              >
                {formatProjectLabel(project)}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          className={[
            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
            active ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
          ].join(" ")}
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
        >
          <span>Meine Projekte</span>
          <ChevronDown
            className={["h-4 w-4 transition-transform", mobileOpen ? "rotate-180" : ""].join(" ")}
            aria-hidden="true"
          />
        </button>
        {mobileOpen ? renderProjectLinks("ml-2 mt-1 space-y-1") : null}
      </div>

      <div className="group hidden lg:block">
        <Link
          href="/projects"
          className={[
            "block rounded-xl px-3 py-2 text-sm transition",
            active ? "bg-drill-50 font-medium" : "hover:bg-base-bg",
          ].join(" ")}
        >
          Meine Projekte
        </Link>
        {renderProjectLinks(
          [
            "ml-2 mt-1 hidden space-y-1",
            active ? "lg:block" : "lg:group-hover:block",
          ].join(" ")
        )}
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
      <SidebarProjects />
      <SidebarReports />
      <SidebarLink href="/drafts" label="Meine Entwürfe" />
      <SidebarLink href="/settings" label="Einstellungen" />
      <SidebarLink href="/archive" label="Archiv" />

      <div className="mt-4 rounded-xl bg-drill-50 p-3">
        <div className="text-sm font-semibold">Quick Tips</div>
        <div className="mt-1 text-xs text-base-muted">
          Speichere zwischendurch als Entwurf. Unterschriften erst am Ende.
        </div>
      </div>
    </nav>
  );
}
