"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type DraftRow = {
  id: string;
  title: string;
  created_at: string;
};

export default function DraftsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [query, setQuery] = useState("");

  const deleteDraft = async (draftId: string) => {
    if (!confirm("Entwurf wirklich löschen?")) return;
    const { error } = await supabase.from("drafts").delete().eq("id", draftId);
    if (error) {
      setErr("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setDrafts((prev) => prev.filter((x) => x.id !== draftId));
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

    const { data, error } = await supabase
      .from("drafts")
      .select("id,title,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErr("Entwürfe laden fehlgeschlagen: " + error.message);
      setLoading(false);
      return;
    }

    setDrafts((data ?? []) as DraftRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((d) => (d.title ?? "").toLowerCase().includes(q));
  }, [drafts, query]);

  const draftTone = (title: string) => {
    const lower = (title ?? "").toLowerCase();
    if (lower.includes("schichtenverzeichnis")) {
      return {
        card: "from-amber-50/70 via-white to-orange-50/50",
        badge: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }
    return {
      card: "from-sky-50/70 via-white to-cyan-50/50",
      badge: "border-sky-200 bg-sky-50 text-sky-800",
    };
  };

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-clip px-3 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Meine Entwürfe</h1>
          <p className="mt-1 text-sm text-slate-600">Alle Entwürfe (lokal & cloud)</p>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50 shadow-sm">
          <div className="border-b border-slate-200/70 bg-gradient-to-r from-slate-50 to-white p-4">
            <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Entwürfe</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {filteredDrafts.length} Einträge
                </p>
              </div>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/60 lg:w-64"
                placeholder="Suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredDrafts.length === 0 ? (
            <div className="p-5 text-sm text-slate-600">
              Keine passenden Entwürfe gefunden.
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDrafts.map((d) => {
                const tone = draftTone(d.title);
                return (
                <div
                  key={d.id}
                  className={[
                    "rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-sm transition",
                    "hover:-translate-y-0.5 hover:shadow-md",
                    tone.card,
                  ].join(" ")}
                >
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-snug text-slate-900 break-words">{d.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`max-w-full rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone.badge}`}>
                      Entwurf
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <Link
                      href={`/reports/new?draftId=${d.id}`}
                      className="btn btn-secondary btn-xs w-full sm:w-auto"
                    >
                      Öffnen
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs w-full sm:w-auto"
                      onClick={() => deleteDraft(d.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
