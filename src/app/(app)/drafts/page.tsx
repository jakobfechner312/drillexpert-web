"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type DraftRow = {
  id: string;
  title: string;
  updated_at: string;
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("drafts")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false });

      if (error) console.error(error);
      setDrafts((data as DraftRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold">Entwürfe</h1>
      <p className="mt-1 text-sm text-base-muted">Hier kannst du gespeicherte Tagesberichte weiterbearbeiten.</p>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="text-sm text-base-muted">Lade…</div>
        ) : drafts.length === 0 ? (
          <div className="text-sm text-base-muted">Noch keine Entwürfe vorhanden.</div>
        ) : (
          drafts.map((d) => (
            <Link
              key={d.id}
              href={`/reports/new?draft=${d.id}`}
              className="block rounded-xl border border-base-border bg-white p-4 hover:bg-base-bg"
            >
              <div className="font-medium">{d.title}</div>
              <div className="mt-1 text-xs text-base-muted">
                Zuletzt geändert: {new Date(d.updated_at).toLocaleString("de-DE")}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}