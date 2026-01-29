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
type ProjectFile = {
  name: string;
  updated_at: string;
  created_at: string;
  metadata?: { size?: number };
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
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const maxFileSizeMb = 25;

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

    // 4) Dateien laden
    setFilesLoading(true);
    setFilesErr(null);
    const { data: fileList, error: fileErr } = await supabase.storage
      .from("dropData")
      .list(`${projectId}/`, { limit: 200, offset: 0 });

    if (fileErr) {
      setFilesErr("Dateien laden fehlgeschlagen: " + fileErr.message);
    } else {
      setFiles((fileList ?? []) as ProjectFile[]);
    }
    setFilesLoading(false);

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

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setFilesErr(null);

    const list = Array.from(fileList);
    const supabase = createClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      setFilesErr("Nicht eingeloggt.");
      setUploading(false);
      return;
    }

    for (const file of list) {
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        setFilesErr(`"${file.name}" ist größer als ${maxFileSizeMb} MB.`);
        continue;
      }

      const path = `${projectId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from("dropData")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (error) {
        setFilesErr(`Upload fehlgeschlagen: ${error.message}`);
      }
    }

    const { data: fileListNew, error: fileErr } = await supabase.storage
      .from("dropData")
      .list(`${projectId}/`, { limit: 200, offset: 0 });

    if (fileErr) {
      setFilesErr("Dateien laden fehlgeschlagen: " + fileErr.message);
    } else {
      setFiles((fileListNew ?? []) as ProjectFile[]);
    }

    setUploading(false);
  };

  const openFile = async (name: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("dropData")
      .createSignedUrl(`${projectId}/${name}`, 60 * 10);

    if (error || !data?.signedUrl) {
      alert("Datei konnte nicht geöffnet werden.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const fileBadge = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: "PDF",
      jpg: "IMG",
      jpeg: "IMG",
      png: "IMG",
      webp: "IMG",
      gif: "IMG",
      heic: "IMG",
      csv: "CSV",
      xlsx: "XLS",
      xls: "XLS",
      doc: "DOC",
      docx: "DOC",
      txt: "TXT",
      rtf: "TXT",
    };
    return map[ext ?? ""] ?? "FILE";
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
            <h2 className="font-medium">Projektinhalte</h2>
            <p className="mt-1 text-sm text-gray-600">
              Berichte und Dateien – sauber getrennt
            </p>
          </div>

          {/* Berichte */}
          <div className="border-b p-4">
            <div className="mb-2 text-xs font-semibold text-gray-500">BERICHTE</div>
            {reports.length === 0 ? (
              <div className="text-sm text-gray-600">Noch keine Berichte vorhanden.</div>
            ) : (
              <ul className="divide-y rounded-2xl border">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-700">
                        TB
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.title}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(r.created_at).toLocaleString()} • Status: {r.status ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/api/pdf/tagesbericht/${r.id}`}
                        target="_blank"
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Öffnen
                      </Link>
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

          {/* Dateien */}
          <div className="p-4">
            <div className="mb-2 text-xs font-semibold text-gray-500">DATEIEN</div>

            <div
              className="rounded-2xl border border-dashed p-6 text-center text-sm text-gray-600"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                uploadFiles(e.dataTransfer.files);
              }}
            >
              <div className="font-medium text-gray-800">Dateien hier ablegen</div>
              <div className="mt-1 text-xs text-gray-500">
                PDF, Bilder, Excel, CSV, DOCX … bis {maxFileSizeMb} MB
              </div>

              <label className="mt-3 inline-block rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
                Dateien auswählen
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.csv,.xlsx,.xls,.doc,.docx,.txt,.rtf"
                />
              </label>

              {uploading && (
                <div className="mt-2 text-xs text-gray-500">Upload läuft…</div>
              )}
              {filesErr && (
                <div className="mt-2 text-xs text-red-600">{filesErr}</div>
              )}
            </div>

            {filesLoading ? (
              <p className="mt-4 text-sm text-gray-600">Lade Dateien…</p>
            ) : files.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">Noch keine Dateien vorhanden.</p>
            ) : (
              <ul className="mt-4 divide-y rounded-2xl border">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-700">
                        {fileBadge(f.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{f.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {(f.metadata?.size ? Math.round(f.metadata.size / 1024) : 0)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => openFile(f.name)}
                    >
                      Öffnen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
