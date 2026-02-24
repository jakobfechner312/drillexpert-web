"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { RHEIN_MAIN_LINK_PROJECT_ID } from "@/lib/reportAccess";
import { MoreHorizontal } from "lucide-react";

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
  const [typeFilter, setTypeFilter] = useState<"all" | "tagesbericht" | "tagesbericht_rhein_main_link" | "schichtenverzeichnis">("all");
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const deleteReport = async (reportId: string) => {
    if (!confirm("Bericht wirklich löschen?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", reportId);
    if (error) {
      setErr("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setReports((prev) => prev.filter((x) => x.id !== reportId));
  };
  const archiveReport = async (reportId: string) => {
    const { error } = await supabase
      .from("reports")
      .update({ status: "archived" })
      .eq("id", reportId);
    if (error) {
      setErr("Archivieren fehlgeschlagen: " + error.message);
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
      .or("status.is.null,status.neq.archived")
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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-kebab-menu]")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
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
    if (type === "tagesbericht_rhein_main_link") {
      return {
        label: "TB Rhein-Main-Link",
        cls: "bg-indigo-50 text-indigo-800 border-indigo-200",
        card: "from-indigo-50/70 via-white to-sky-50/40",
      };
    }
    if (type === "schichtenverzeichnis") {
      return {
        label: "Schichtenverzeichnis",
        cls: "bg-amber-50 text-amber-800 border-amber-200",
        card: "from-amber-50/70 via-white to-orange-50/50",
      };
    }
    return {
      label: "Tagesbericht",
      cls: "bg-sky-50 text-sky-800 border-sky-200",
      card: "from-sky-50/70 via-white to-cyan-50/50",
    };
  };

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meine Berichte</h1>
          <p className="mt-1 text-sm text-gray-600">
            Berichte ohne Projektzuordnung (project_id = NULL)
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary w-full sm:w-auto"
          onClick={() => setCreateOpen(true)}
        >
          + Bericht erstellen
        </button>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-5 rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50 shadow-sm">
          <div className="border-b border-slate-200/70 bg-gradient-to-r from-slate-50 to-white p-4 sm:p-5">
            <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Berichte</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {filteredReports.length} Einträge
                </p>
              </div>
              <div className="w-full space-y-2 lg:w-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={[
                      "rounded-full border px-3.5 py-2 text-xs font-medium",
                      typeFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                    ].join(" ")}
                    onClick={() => setTypeFilter("all")}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    className={[
                      "rounded-full border px-3.5 py-2 text-xs font-medium",
                      typeFilter === "tagesbericht" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                    ].join(" ")}
                    onClick={() => setTypeFilter("tagesbericht")}
                  >
                    Tagesbericht
                  </button>
                  <button
                    type="button"
                    className={[
                      "rounded-full border px-3.5 py-2 text-xs font-medium",
                      typeFilter === "tagesbericht_rhein_main_link" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                    ].join(" ")}
                    onClick={() => setTypeFilter("tagesbericht_rhein_main_link")}
                  >
                    TB Rhein-Main-Link
                  </button>
                  <button
                    type="button"
                    className={[
                      "rounded-full border px-3.5 py-2 text-xs font-medium",
                      typeFilter === "schichtenverzeichnis" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                    ].join(" ")}
                    onClick={() => setTypeFilter("schichtenverzeichnis")}
                  >
                    Schichtenverzeichnis
                  </button>
                </div>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/60 lg:w-72"
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
            <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredReports.map((r) => {
                const type = typeBadge(r.report_type);
                const reportMenuId = `report-${r.id}`;
                return (
                  <div
                    key={r.id}
                    className={[
                      "relative rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-sm transition",
                      "hover:-translate-y-0.5 hover:shadow-md",
                      openMenuId === reportMenuId ? "z-20" : "z-0",
                      type.card,
                    ].join(" ")}
                  >
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold leading-snug text-slate-900 break-words">{r.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={`max-w-full rounded-full border border-slate-200/70 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${type.cls}`}>
                        {type.label}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <span>Status:</span>
                      <span className="rounded-full border border-slate-200/70 px-2 py-0.5">
                        {r.status ?? "—"}
                      </span>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <div className="relative" data-kebab-menu>
                        {(() => {
                          const isOpen = openMenuId === reportMenuId;
                          const openHref =
                            r.report_type === "schichtenverzeichnis"
                              ? `/api/pdf/schichtenverzeichnis/${r.id}`
                              : r.report_type === "tagesbericht_rhein_main_link"
                                ? `/api/pdf/tagesbericht-rhein-main-link/${r.id}`
                                : `/api/pdf/tagesbericht/${r.id}`;
                          const editHref =
                            r.report_type === "schichtenverzeichnis"
                              ? `/reports/schichtenverzeichnis/step/${r.id}/edit`
                              : r.report_type === "tagesbericht_rhein_main_link"
                                ? `/reports/rhein-main-link/${r.id}/edit`
                                : `/reports/${r.id}/edit`;
                          return (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50"
                                onClick={() => setOpenMenuId(isOpen ? null : reportMenuId)}
                                aria-label="Aktionen"
                                aria-expanded={isOpen}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                              {isOpen ? (
                                <div className="absolute right-0 top-full z-[80] mt-2 w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-lg">
                                  <Link href={openHref} target="_blank" className="flex rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuId(null)}>
                                    Öffnen
                                  </Link>
                                  <Link href={editHref} className="flex rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuId(null)}>
                                    Bearbeiten
                                  </Link>
                                  <button type="button" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { setOpenMenuId(null); archiveReport(r.id); }}>
                                    Archivieren
                                  </button>
                                  <button type="button" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { setOpenMenuId(null); deleteReport(r.id); }}>
                                    Löschen
                                  </button>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Bericht erstellen</h3>
              <button
                type="button"
                className="btn btn-secondary w-full sm:w-auto"
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
                href={`/projects/${RHEIN_MAIN_LINK_PROJECT_ID}/reports/rhein-main-link/new`}
                className="block rounded-xl border px-3 py-3 hover:bg-gray-50"
                onClick={() => setCreateOpen(false)}
              >
                Tagesbericht Rhein-Main-Link
                <div className="mt-1 text-xs text-gray-500">
                  Bautagesbericht für TB_RML Vorlage
                </div>
              </Link>
              <Link
                href="/reports/schichtenverzeichnis/step"
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
