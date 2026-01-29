"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type DraftRow = {
  id: string;
  title: string;
  created_at: string;
  status: string | null;
};

export default function DraftsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

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
      .select("id,title,created_at,status")
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
            <h2 className="font-medium">Entwürfe</h2>
            <p className="mt-1 text-sm text-gray-600">
              {drafts.length} Einträge
            </p>
          </div>

          {drafts.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              Noch keine Entwürfe vorhanden.
            </div>
          ) : (
            <ul className="divide-y">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(d.created_at).toLocaleString()} • Status:{" "}
                      {d.status ?? "draft"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/reports/new?draftId=${d.id}`}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Öffnen
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
