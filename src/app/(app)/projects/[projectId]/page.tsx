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
  const [filter, setFilter] = useState<"all" | "reports" | "files" | "images">("all");

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

  const isImageFile = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext ?? "");
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

  const fileBadgeClass = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "bg-red-50 text-red-700 ring-red-200";
    if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext ?? "")) return "bg-sky-50 text-sky-700 ring-sky-200";
    if (["xls", "xlsx", "csv"].includes(ext ?? "")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (["doc", "docx", "rtf", "txt"].includes(ext ?? "")) return "bg-amber-50 text-amber-700 ring-amber-200";
    return "bg-slate-50 text-slate-700 ring-slate-200";
  };

  const items = useMemo(() => {
    const reportItems = reports.map((r) => ({
      type: "report" as const,
      id: r.id,
      title: r.title,
      created_at: r.created_at,
      status: r.status,
    }));

    const fileItems = files.map((f) => ({
      type: "file" as const,
      name: f.name,
      created_at: f.updated_at || f.created_at,
      size: f.metadata?.size ?? 0,
      isImage: isImageFile(f.name),
    }));

    const merged = [...reportItems, ...fileItems].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });

    return merged.filter((item) => {
      if (filter === "all") return true;
      if (filter === "reports") return item.type === "report";
      if (filter === "files") return item.type === "file";
      if (filter === "images") return item.type === "file" && item.isImage;
      return true;
    });
  }, [reports, files, filter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{project?.name ?? "Projekt"}</h1>
          <p className="mt-1 text-sm text-gray-600">{projectId}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/projects/${projectId}/reports/new`}
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
          >
            + Tagesbericht
          </Link>
          <Link
            href={`/projects/${projectId}/reports/schichtenverzeichnis/new`}
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
          >
            + Schichtenverzeichnis
          </Link>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 rounded-2xl border">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Projekt‑Stream</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Alles an einem Ort: Berichte & Dateien
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "Alle" },
                  { id: "reports", label: "Berichte" },
                  { id: "files", label: "Dateien" },
                  { id: "images", label: "Bilder" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id as typeof filter)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs",
                      filter === f.id ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-b p-4">
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
          </div>

          <div className="p-4">
            {filesLoading ? (
              <p className="text-sm text-gray-600">Lade Dateien…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-600">Noch keine Inhalte vorhanden.</p>
            ) : (
              <ul className="divide-y rounded-2xl border">
                {items.map((item) =>
                  item.type === "report" ? (
                    <li key={`r-${item.id}`} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                            <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                            <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.title}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {new Date(item.created_at).toLocaleString()} • Status: {item.status ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/api/pdf/tagesbericht/${item.id}`}
                          target="_blank"
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          Öffnen
                        </Link>
                        {canEditOrDelete({ id: item.id, title: item.title, created_at: item.created_at, user_id: "", status: item.status ?? null }) && (
                          <Link
                            href={`/projects/${projectId}/reports/${item.id}/edit`}
                            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            title="Bearbeiten"
                          >
                            ✏️
                          </Link>
                        )}
                      </div>
                    </li>
                  ) : (
                    <li key={`f-${item.name}`} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-semibold ring-1 ${fileBadgeClass(item.name)}`}>
                          {fileBadge(item.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {new Date(item.created_at).toLocaleString()} • {(item.size ? Math.round(item.size / 1024) : 0)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => openFile(item.name)}
                      >
                        Öffnen
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
