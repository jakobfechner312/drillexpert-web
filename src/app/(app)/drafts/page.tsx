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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meine Entwürfe</h1>
          <p className="mt-1 text-sm text-gray-600">Alle Entwürfe (lokal & cloud)</p>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 rounded-2xl border">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Entwürfe</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {filteredDrafts.length} Einträge
                </p>
              </div>
              <input
                className="rounded-xl border px-3 py-1.5 text-xs"
                placeholder="Suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredDrafts.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              Keine passenden Entwürfe gefunden.
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {filteredDrafts.map((d) => (
                <div key={d.id} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{d.title}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      Entwurf
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/reports/new?draftId=${d.id}`}
                      className="btn btn-secondary btn-xs"
                    >
                      Öffnen
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => deleteDraft(d.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
