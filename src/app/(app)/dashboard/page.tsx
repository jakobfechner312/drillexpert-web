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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

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

      const projMapped = (projRes.data ?? [])
        .map((row: any) => row.project)
        .filter(Boolean) as ProjectRow[];

      setProjects(projMapped);
      setReports((repRes.data ?? []) as ReportRow[]);
      setDrafts((draftRes.data ?? []) as DraftRow[]);
      setLoading(false);
    };

    load();
  }, [supabase]);

  const typeBadge = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-sky-50 text-sky-800 border-sky-200";
  };

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dashboard</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Willkommen bei Drillexpert</h1>
            <p className="mt-1 text-sm text-slate-600">
              Tagesberichte & Schichtenverzeichnisse in Minuten erstellt.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                <span className="spin-slow absolute inset-0 rounded-full border border-slate-300/70" />
                <span className="floaty h-2 w-2 rounded-full bg-sky-500" />
              </span>
              Live-Aktivität
            </div>
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

      {loading && <p className="mt-6 text-sm text-slate-600">Lade…</p>}
      {err && <p className="mt-6 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Projekte</div>
              <div className="mt-2 text-2xl font-semibold">{projects.length}</div>
              <div className="mt-2 text-xs text-slate-500">Mitgliedschaften</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Berichte</div>
              <div className="mt-2 text-2xl font-semibold">{reports.length}</div>
              <div className="mt-2 text-xs text-slate-500">Zuletzt bearbeitet</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Entwürfe</div>
              <div className="mt-2 text-2xl font-semibold">{drafts.length}</div>
              <div className="mt-2 text-xs text-slate-500">Lokale & Cloud</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Zuletzt bearbeitete Berichte</h2>
                <Link href="/reports" className="text-xs text-slate-500 hover:text-slate-700">
                  Alle anzeigen
                </Link>
              </div>
              {reports.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Noch keine Berichte vorhanden.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {reports.slice(0, 3).map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={`rounded-full border border-slate-200/70 px-2 py-0.5 text-[11px] font-semibold ${typeBadge(r.report_type)}`}>
                        {r.report_type === "schichtenverzeichnis" ? "Schichtenverzeichnis" : "Tagesbericht"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Zuletzt gespeicherte Entwürfe</h2>
                <Link href="/drafts" className="text-xs text-slate-500 hover:text-slate-700">
                  Alle anzeigen
                </Link>
              </div>
              {drafts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Noch keine Entwürfe vorhanden.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {drafts.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {new Date(d.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Link href={`/reports/new?draftId=${d.id}`} className="btn btn-secondary btn-xs">
                        Öffnen
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
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
