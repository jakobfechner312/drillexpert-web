"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  status: string | null;
};

export default function MyReportsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

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
      .select("id,title,created_at,status")
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meine Berichte</h1>
          <p className="mt-1 text-sm text-gray-600">
            Berichte ohne Projektzuordnung (project_id = NULL)
          </p>
        </div>

        <Link
          href="/reports/new"
          className="rounded-xl border px-3 py-2 hover:bg-gray-50"
        >
          + Bericht erstellen
        </Link>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 rounded-2xl border">
          <div className="border-b p-4">
            <h2 className="font-medium">Berichte</h2>
            <p className="mt-1 text-sm text-gray-600">
              {reports.length} Einträge
            </p>
          </div>

          {reports.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              Noch keine „Meine Berichte“ vorhanden.
            </div>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()} • Status:{" "}
                      {r.status ?? "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Öffnen */}
                    <Link
                      href={`/api/pdf/tagesbericht/${r.id}`}
                      target="_blank"
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Öffnen
                    </Link>

                    {/* Edit (kommt als nächster Schritt, wenn du willst) */}
                    <Link
                      href={`/reports/${r.id}/edit`}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                      title="Bearbeiten"
                    >
                      ✏️
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