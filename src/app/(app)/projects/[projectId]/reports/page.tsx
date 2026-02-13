"use client";

import { createClient } from "@/lib/supabase/browser";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "tagesbericht" | "tagesbericht_rhein_main_link" | "schichtenverzeichnis">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const loadReports = async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, title, created_at, user_id, report_type")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (!error) setReports(data ?? []);
      setLoading(false);
    };

    loadReports();
  }, [projectId, supabase]);

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
    if (type === "tagesbericht_rhein_main_link") return { label: "TB Rhein-Main-Link", cls: "bg-indigo-50 text-indigo-800 border-indigo-200" };
    if (type === "schichtenverzeichnis") return { label: "Schichtenverzeichnis", cls: "bg-amber-50 text-amber-800 border-amber-200" };
    return { label: "Tagesbericht", cls: "bg-sky-50 text-sky-800 border-sky-200" };
  };

  if (loading) return <p>Lade Berichte…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Berichte</h1>

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
            typeFilter === "tagesbericht_rhein_main_link" ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
          ].join(" ")}
          onClick={() => setTypeFilter("tagesbericht_rhein_main_link")}
        >
          TB Rhein-Main-Link
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

      {filteredReports.length === 0 ? (
        <p className="text-sm text-gray-500">Keine passenden Berichte.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredReports.map((r) => {
            const type = typeBadge(r.report_type);
            return (
              <div key={r.id} className="rounded-2xl border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${type.cls}`}>
                    {type.label}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    href={
                      r.report_type === "schichtenverzeichnis"
                        ? `/api/pdf/schichtenverzeichnis/${r.id}`
                        : r.report_type === "tagesbericht_rhein_main_link"
                          ? `/api/pdf/tagesbericht-rhein-main-link/${r.id}`
                          : `/api/pdf/tagesbericht/${r.id}`
                    }
                    className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                    target="_blank"
                  >
                    Öffnen
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
