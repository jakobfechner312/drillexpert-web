"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  status: string | null;
  report_type?: string | null;
};

export default function MyReportsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "tagesbericht" | "schichtenverzeichnis">("all");
  const [query, setQuery] = useState("");

  const deleteReport = async (reportId: string) => {
    if (!confirm("Bericht wirklich löschen?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", reportId);
    if (error) {
      setErr("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setReports((prev) => prev.filter((x) => x.id !== reportId));
  };

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

    // ✅ Meine Berichte = project_id IS NULL
    const { data: reps, error: repsErr } = await supabase
      .from("reports")
      .select("id,title,created_at,status,report_type")
      .is("project_id", null)
      .order("created_at", { ascending: false });

    if (repsErr) {
      setErr("Berichte laden fehlgeschlagen: " + repsErr.message);
      setLoading(false);
      return;
    }

    setReports((reps ?? []) as ReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      const type = r.report_type ?? "tagesbericht";
      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (!q) return true;
      return (r.title ?? "").toLowerCase().includes(q);
    });
  }, [reports, typeFilter, query]);

  const typeBadge = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") return { label: "Schichtenverzeichnis", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    return { label: "Tagesbericht", cls: "bg-sky-50 text-sky-800 border-sky-200" };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meine Berichte</h1>
          <p className="mt-1 text-sm text-gray-600">
            Berichte ohne Projektzuordnung (project_id = NULL)
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCreateOpen(true)}
        >
          + Bericht erstellen
        </button>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Berichte</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {filteredReports.length} Einträge
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={[
                    "rounded-full border px-3 py-1 text-xs",
                    typeFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => setTypeFilter("all")}
                >
                  Alle
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-full border px-3 py-1 text-xs",
                    typeFilter === "tagesbericht" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => setTypeFilter("tagesbericht")}
                >
                  Tagesbericht
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-full border px-3 py-1 text-xs",
                    typeFilter === "schichtenverzeichnis" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => setTypeFilter("schichtenverzeichnis")}
                >
                  Schichtenverzeichnis
                </button>
                <input
                  className="ml-1 rounded-xl border px-3 py-1.5 text-xs"
                  placeholder="Suchen…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              Keine passenden Berichte gefunden.
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {filteredReports.map((r) => {
                const type = typeBadge(r.report_type);
                return (
                  <div key={r.id} className="rounded-2xl border border-slate-200/70 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{r.title}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={`rounded-full border border-slate-200/70 px-2 py-0.5 text-[11px] font-semibold ${type.cls}`}>
                        {type.label}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      <span>Status:</span>
                      <span className="rounded-full border border-slate-200/70 px-2 py-0.5">
                        {r.status ?? "—"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Link
                        href={
                          r.report_type === "schichtenverzeichnis"
                            ? `/api/pdf/schichtenverzeichnis/${r.id}`
                            : `/api/pdf/tagesbericht/${r.id}`
                        }
                        target="_blank"
                        className="btn btn-secondary btn-xs"
                      >
                        Öffnen
                      </Link>
                      <Link
                        href={
                          r.report_type === "schichtenverzeichnis"
                            ? `/reports/schichtenverzeichnis/${r.id}/edit`
                            : `/reports/${r.id}/edit`
                        }
                        className="btn btn-secondary btn-xs"
                        title="Bearbeiten"
                      >
                        Bearbeiten
                      </Link>
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => deleteReport(r.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Bericht erstellen</h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <Link
                href="/reports/new"
                className="block rounded-xl border px-3 py-3 hover:bg-gray-50"
                onClick={() => setCreateOpen(false)}
              >
                Tagesbericht
                <div className="mt-1 text-xs text-gray-500">
                  Standard Tagesbericht (digital)
                </div>
              </Link>
              <Link
                href="/reports/schichtenverzeichnis/new"
                className="block rounded-xl border px-3 py-3 hover:bg-gray-50"
                onClick={() => setCreateOpen(false)}
              >
                Schichtenverzeichnis
                <div className="mt-1 text-xs text-gray-500">
                  PDF-Template mit zwei Seiten
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
