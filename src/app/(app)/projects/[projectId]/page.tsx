"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Project = { id: string; name: string };
type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  user_id: string; // Ersteller
  status: string | null;
};

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string } | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

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
    setMe({ id: user.id });

    // 1) Projekt laden
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id,name")
      .eq("id", projectId)
      .single();

    if (projErr) {
      setErr("Projekt laden fehlgeschlagen: " + projErr.message);
      setLoading(false);
      return;
    }
    setProject(proj as Project);

    // 2) Rolle im Projekt laden (owner / member)
    const { data: mem, error: memErr } = await supabase
      .from("project_members")
      .select("role_in_project")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (memErr) {
      // wenn keine membership -> sollte durch RLS eh blocken, aber UI-mäßig:
      setRole(null);
    } else {
      setRole((mem as any)?.role_in_project ?? null);
    }

    // 3) Reports laden
    const { data: reps, error: repsErr } = await supabase
      .from("reports")
      .select("id,title,created_at,user_id,status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (repsErr) {
      setErr("Reports laden fehlgeschlagen: " + repsErr.message);
      setLoading(false);
      return;
    }

    setReports((reps ?? []) as ReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const canEditOrDelete = (r: ReportRow) => {
    if (!me) return false;
    const isCreator = r.user_id === me.id;
    const isOwner = role === "owner";
    return isCreator || isOwner;
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm("Bericht wirklich löschen?")) return;

    const { error } = await supabase.from("reports").delete().eq("id", reportId);
    if (error) {
      alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setReports((prev) => prev.filter((x) => x.id !== reportId));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{project?.name ?? "Projekt"}</h1>
          <p className="mt-1 text-sm text-gray-600">{projectId}</p>
        </div>

        <Link
          href={`/projects/${projectId}/reports/new`}
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
            <div className="p-4 text-sm text-gray-600">Noch keine Berichte vorhanden.</div>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()} • Status: {r.status ?? "—"}
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
                    {/* Edit / Delete nur wenn erlaubt */}
                    {canEditOrDelete(r) && (
                      <>
                        <Link
                          href={`/projects/${projectId}/reports/${r.id}/edit`}
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                          title="Bearbeiten"
                        >
                          ✏️
                        </Link>

                        <button
                          type="button"
                          onClick={() => deleteReport(r.id)}
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                          title="Löschen"
                        >
                          🗑
                        </button>
                      </>
                    )}
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