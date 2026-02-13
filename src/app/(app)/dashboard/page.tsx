"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  report_type?: string | null;
};

type DraftRow = {
  id: string;
  title: string;
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
};

type ProjectMemberSelectRow = {
  project: ProjectRow | ProjectRow[] | null;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  const [installHint, setInstallHint] = useState<string | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (userErr || !user) {
        setErr("Nicht eingeloggt.");
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      const [projRes, repRes, draftRes] = await Promise.all([
        supabase
          .from("project_members")
          .select("project:projects(id,name)")
          .eq("user_id", user.id),
        supabase
          .from("reports")
          .select("id,title,created_at,report_type")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("drafts")
          .select("id,title,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (projRes.error || repRes.error || draftRes.error) {
        setErr(
          projRes.error?.message ||
            repRes.error?.message ||
            draftRes.error?.message ||
            "Laden fehlgeschlagen."
        );
        setLoading(false);
        return;
      }

      const projMapped = ((projRes.data ?? []) as ProjectMemberSelectRow[])
        .flatMap((row) => {
          if (!row.project) return [];
          return Array.isArray(row.project) ? row.project : [row.project];
        })
        .filter((p) => Boolean(p?.id && p?.name));

      setProjects(projMapped);
      setReports((repRes.data ?? []) as ReportRow[]);
      setDrafts((draftRes.data ?? []) as DraftRow[]);

      setLoading(false);
    };

    load();
  }, [supabase]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const handleDomainBannerClick = async () => {
    const targetUrl = "https://drillexpert.app";
    const onTargetHost = typeof window !== "undefined" && window.location.hostname === "drillexpert.app";

    if (!onTargetHost) {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      setInstallHint("Neue Seite geöffnet. Dort kannst du die Verknüpfung installieren.");
      return;
    }

    if (installPromptEvent) {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      setInstallHint(
        choice.outcome === "accepted"
          ? "Verknüpfung/Installation gestartet ✅"
          : "Installation abgebrochen. Du kannst sie über Browser-Menü erneut starten."
      );
      setInstallPromptEvent(null);
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMac = /mac os/.test(ua) && !isIOS;
    const isWindows = /windows/.test(ua);

    if (isIOS) {
      setInstallHint("Safari: Teilen → Zum Home-Bildschirm.");
      return;
    }
    if (isAndroid) {
      setInstallHint("Chrome/Brave: Menü ⋮ → App installieren / Zum Startbildschirm hinzufügen.");
      return;
    }
    if (isMac) {
      setInstallHint("Brave/Chrome auf Mac: Speichern und teilen → Verknüpfung erstellen.");
      return;
    }
    if (isWindows) {
      setInstallHint("Chrome/Edge: Menü → App installieren oder Verknüpfung erstellen.");
      return;
    }

    setInstallHint("Browser-Menü öffnen und 'App installieren' oder 'Verknüpfung erstellen' wählen.");
  };

  return (
    <div className="mx-auto max-w-[1800px] overflow-x-hidden px-4 py-6">
      <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dashboard</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Willkommen bei Drillexpert</h1>
            <p className="mt-1 text-sm text-slate-600">
              Tagesberichte & Schichtenverzeichnisse in Minuten erstellt.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateReportOpen(true)}
            >
              + Bericht erstellen
            </button>
            <Link href="/projects" className="btn btn-secondary">
              Meine Projekte
            </Link>
          </div>
        </div>
      </div>

      {!loading && !err && (
        <button
          type="button"
          onClick={handleDomainBannerClick}
          className="mt-6 w-full rounded-3xl border border-sky-200/70 bg-gradient-to-r from-sky-600 via-cyan-500 to-blue-600 p-5 text-left text-white shadow-soft transition hover:brightness-105"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-100/90">Neu</div>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">🚀 Drillexpert ist jetzt live auf drillexpert.app</h2>
              <p className="mt-2 text-sm text-sky-50/95">
                📱💻 Tippe hier für App-Install/Verknüpfung und schnellen Start auf jedem Gerät.
              </p>
            </div>
            <div className="rounded-full border border-white/40 bg-white/20 px-4 py-2 text-sm font-semibold">
              ✨ Jetzt verknüpfen
            </div>
          </div>
          {installHint ? (
            <div className="mt-3 rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-xs text-sky-50">
              {installHint}
            </div>
          ) : null}
        </button>
      )}

      {loading && <p className="mt-6 text-sm text-slate-600">Lade…</p>}
      {err && <p className="mt-6 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">Projekte</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{projects.length}</div>
            <p className="mt-1 text-xs text-slate-500">Mitgliedschaften</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">Berichte</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{reports.length}</div>
            <p className="mt-1 text-xs text-slate-500">Zuletzt bearbeitet</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-slate-500">Entwürfe</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{drafts.length}</div>
            <p className="mt-1 text-xs text-slate-500">Lokale & Cloud</p>
          </div>
        </div>
      )}

      {createReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Bericht erstellen</h3>
                <p className="text-xs text-slate-500">Wähle den Berichtstyp</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreateReportOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Link
                href="/reports/new"
                className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="text-sm font-semibold text-sky-900">Tagesbericht</div>
                <div className="mt-1 text-xs text-sky-700">
                  Tagesleistung, Bohrungen, Personal
                </div>
              </Link>
              <Link
                href="/reports/new/rhein-main-link"
                className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="text-sm font-semibold text-indigo-900">TB Rhein-Main-Link</div>
                <div className="mt-1 text-xs text-indigo-700">
                  Bautagesbericht auf TB_RML Vorlage
                </div>
              </Link>
              <Link
                href="/reports/schichtenverzeichnis/step"
                className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="text-sm font-semibold text-amber-900">Schichtenverzeichnis</div>
                <div className="mt-1 text-xs text-amber-700">
                  Schichten, Proben, Feststellungen
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
