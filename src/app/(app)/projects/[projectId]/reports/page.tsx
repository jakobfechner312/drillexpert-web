"use client";

import { createClient } from "@/lib/supabase/browser";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const supabase = createClient();

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, title, created_at, user_id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (!error) setReports(data ?? []);
      setLoading(false);
    };

    loadReports();
  }, [projectId, supabase]);

  if (loading) return <p>Lade Berichte…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Berichte</h1>

      {reports.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Berichte.</p>
      ) : (
        reports.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl border p-3"
          >
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-gray-500">
                {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/projects/${projectId}/reports/${r.id}`}
                className="text-sm underline"
              >
                Öffnen
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}