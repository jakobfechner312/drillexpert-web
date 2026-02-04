"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_contact?: string | null;
  client_phone?: string | null;
  client_mobile?: string | null;
  client_email?: string | null;
  stakeholder_name?: string | null;
  stakeholder_contact?: string | null;
  stakeholder_phone?: string | null;
  stakeholder_mobile?: string | null;
  stakeholder_email?: string | null;
  program_borehole?: boolean | null;
  program_surface?: boolean | null;
  program_ramming?: boolean | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
};
type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  user_id: string; // Ersteller
  status: string | null;
  report_type?: string | null;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<Project>({
    id: projectId,
    name: "",
    project_number: "",
    client_name: "",
    client_address: "",
    client_contact: "",
    client_phone: "",
    client_mobile: "",
    client_email: "",
    stakeholder_name: "",
    stakeholder_contact: "",
    stakeholder_phone: "",
    stakeholder_mobile: "",
    stakeholder_email: "",
    program_borehole: false,
    program_surface: false,
    program_ramming: false,
    status: "geplant",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const maxFileSizeMb = 25;
  const [filter, setFilter] = useState<"all" | "reports" | "files" | "images">("all");
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [memberOk, setMemberOk] = useState<string | null>(null);

  const SectionCard = ({
    title,
    subtitle,
    action,
    children,
  }: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="text-base font-semibold text-sky-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );

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
      .select([
        "id",
        "name",
        "project_number",
        "client_name",
        "client_address",
        "client_contact",
        "client_phone",
        "client_mobile",
        "client_email",
        "stakeholder_name",
        "stakeholder_contact",
        "stakeholder_phone",
        "stakeholder_mobile",
        "stakeholder_email",
        "program_borehole",
        "program_surface",
        "program_ramming",
        "status",
        "start_date",
        "end_date",
        "notes",
      ].join(","))
      .eq("id", projectId)
      .single();

    if (projErr) {
      setErr("Projekt laden fehlgeschlagen: " + projErr.message);
      setLoading(false);
      return;
    }
    const projectRow = proj as unknown as Project;
    setProject(projectRow);
    setSettingsForm((prev) => ({
      ...prev,
      id: projectRow.id,
      name: projectRow.name ?? "",
      project_number: projectRow.project_number ?? "",
      client_name: projectRow.client_name ?? "",
      client_address: projectRow.client_address ?? "",
      client_contact: projectRow.client_contact ?? "",
      client_phone: projectRow.client_phone ?? "",
      client_mobile: projectRow.client_mobile ?? "",
      client_email: projectRow.client_email ?? "",
      stakeholder_name: projectRow.stakeholder_name ?? "",
      stakeholder_contact: projectRow.stakeholder_contact ?? "",
      stakeholder_phone: projectRow.stakeholder_phone ?? "",
      stakeholder_mobile: projectRow.stakeholder_mobile ?? "",
      stakeholder_email: projectRow.stakeholder_email ?? "",
      program_borehole: Boolean(projectRow.program_borehole),
      program_surface: Boolean(projectRow.program_surface),
      program_ramming: Boolean(projectRow.program_ramming),
      status: projectRow.status ?? "geplant",
      start_date: projectRow.start_date ?? "",
      end_date: projectRow.end_date ?? "",
      notes: projectRow.notes ?? "",
    }));

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
      .select("id,title,created_at,user_id,status,report_type")
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

  const saveSettings = async () => {
    const name = settingsForm.name?.trim();
    const projectNumber = settingsForm.project_number?.trim();
    const clientName = settingsForm.client_name?.trim();
    if (!name) {
      setSettingsError("Projektname ist Pflicht.");
      return;
    }
    if (!projectNumber) {
      setSettingsError("Projektnummer ist Pflicht.");
      return;
    }
    if (!clientName) {
      setSettingsError("Auftraggeber ist Pflicht.");
      return;
    }

    setSettingsError(null);
    setSavingSettings(true);
    const payload = {
      name,
      project_number: projectNumber,
      client_name: clientName,
      client_address: settingsForm.client_address?.trim() || null,
      client_contact: settingsForm.client_contact?.trim() || null,
      client_phone: settingsForm.client_phone?.trim() || null,
      client_mobile: settingsForm.client_mobile?.trim() || null,
      client_email: settingsForm.client_email?.trim() || null,
      stakeholder_name: settingsForm.stakeholder_name?.trim() || null,
      stakeholder_contact: settingsForm.stakeholder_contact?.trim() || null,
      stakeholder_phone: settingsForm.stakeholder_phone?.trim() || null,
      stakeholder_mobile: settingsForm.stakeholder_mobile?.trim() || null,
      stakeholder_email: settingsForm.stakeholder_email?.trim() || null,
      program_borehole: Boolean(settingsForm.program_borehole),
      program_surface: Boolean(settingsForm.program_surface),
      program_ramming: Boolean(settingsForm.program_ramming),
      status: settingsForm.status || null,
      start_date: settingsForm.start_date || null,
      end_date: settingsForm.end_date || null,
      notes: settingsForm.notes?.trim() || null,
    };

    const { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", projectId)
      .select([
        "id",
        "name",
        "project_number",
        "client_name",
        "client_address",
        "client_contact",
        "client_phone",
        "client_mobile",
        "client_email",
        "stakeholder_name",
        "stakeholder_contact",
        "stakeholder_phone",
        "stakeholder_mobile",
        "stakeholder_email",
        "program_borehole",
        "program_surface",
        "program_ramming",
        "status",
        "start_date",
        "end_date",
        "notes",
      ].join(","))
      .single();

    if (error) {
      setSettingsError("Speichern fehlgeschlagen: " + error.message);
      setSavingSettings(false);
      return;
    }

    setProject(data as Project);
    setSettingsOpen(false);
    setSavingSettings(false);
  };

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

  const deleteFile = async (name: string) => {
    if (!confirm("Datei wirklich löschen?")) return;
    const { error } = await supabase.storage.from("dropData").remove([`${projectId}/${name}`]);
    if (error) {
      alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setFiles((prev) => prev.filter((x) => x.name !== name));
  };

  const addMemberByEmail = async () => {
    const email = memberEmail.trim().toLowerCase();
    if (!email) {
      setMemberErr("Bitte E-Mail eingeben.");
      return;
    }

    setAddingMember(true);
    setMemberErr(null);
    setMemberOk(null);

    try {
      const { data, error } = await supabase.rpc("get_user_by_email_for_project", {
        p_project_id: projectId,
        p_email: email,
      });

      if (error) {
        setMemberErr("Suche fehlgeschlagen: " + error.message);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.user_id) {
        setMemberErr("Kein Nutzer mit dieser E-Mail gefunden.");
        return;
      }

      const { error: insErr } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: row.user_id,
        role_in_project: "member",
      });

      if (insErr) {
        if (typeof insErr === "object" && insErr && "code" in insErr && (insErr as { code?: string }).code === "23505") {
          setMemberOk("Ist schon Mitglied ✅");
          return;
        }
        setMemberErr("Hinzufügen fehlgeschlagen: " + insErr.message);
        return;
      }

      setMemberOk("Mitglied hinzugefügt ✅");
      setMemberEmail("");
      await load();
    } finally {
      setAddingMember(false);
    }
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

  const typeBadge = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") return { label: "Schichtenverzeichnis", cls: "bg-amber-50 text-amber-800 ring-amber-200" };
    return { label: "Tagesbericht", cls: "bg-sky-50 text-sky-800 ring-sky-200" };
  };

  const items = useMemo(() => {
    const reportItems = reports.map((r) => ({
      type: "report" as const,
      id: r.id,
      title: r.title,
      created_at: r.created_at,
      status: r.status,
      report_type: r.report_type ?? "tagesbericht",
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
    <div className="page-shell space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-white via-white to-slate-50 px-6 py-5 border-b border-slate-200/70">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Projekt</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 truncate">
              {project?.name ?? "Projekt"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {project?.project_number ? `Nr. ${project.project_number}` : projectId}
              </span>
              {project?.client_name && (
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M4 19h16M6 10h12l-1 9H7l-1-9zM9 10V6h6v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {project.client_name}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSettingsOpen(true)}
              title="Projekt‑Details bearbeiten"
            >
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M19.4 15.5c.1-.3.2-.6.3-.9l1.8-1-1.8-3.2-2.1.5a7.7 7.7 0 0 0-.7-.6l-.3-2.2h-3.7l-.3 2.2a7.7 7.7 0 0 0-.7.6l-2.1-.5-1.8 3.2 1.8 1c0 .3.1.6.3.9s-.1.6-.3.9l-1.8 1 1.8 3.2 2.1-.5c.2.2.4.4.7.6l.3 2.2h3.7l.3-2.2c.3-.2.5-.4.7-.6l2.1.5 1.8-3.2-1.8-1c-.1-.3-.2-.6-.3-.9z" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
                Einstellungen
              </span>
            </button>
            <Link
              href={`/projects/${projectId}/reports/new`}
              className="btn btn-secondary"
            >
              + Tagesbericht
            </Link>
            <Link
              href={`/projects/${projectId}/reports/schichtenverzeichnis/new`}
              className="btn btn-secondary"
            >
              + Schichtenverzeichnis
            </Link>
          </div>
        </div>
      </section>

      {!loading && !err && project && (
        <SectionCard
          title="Projektübersicht"
          subtitle="Erweiterte Angaben aus dem Formular"
          action={
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M7 3h10v4H7zM5 9h14v12H5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              Status: {project.status ?? "—"}
            </span>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-700" aria-hidden="true">
                  <path d="M4 19h16M6 10h12l-1 9H7l-1-9zM9 10V6h6v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Auftraggeber
              </div>
              <div className="mt-2 text-sm text-slate-700">{project.client_name ?? "—"}</div>
              {project.client_address && <div className="mt-1 text-xs text-slate-500">{project.client_address}</div>}
              {project.client_contact && <div className="mt-1 text-xs text-slate-600">Ansprechpartner: {project.client_contact}</div>}
              <div className="mt-2 text-xs text-slate-500">
                {(project.client_phone && `Tel: ${project.client_phone}`) || ""}
                {project.client_mobile ? ` • Mobil: ${project.client_mobile}` : ""}
                {project.client_email ? ` • Mail: ${project.client_email}` : ""}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-700" aria-hidden="true">
                  <path d="M8 11a4 4 0 1 1 8 0 4 4 0 0 1-8 0zM3 20a6 6 0 0 1 18 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Gutachter / Beteiligte
              </div>
              <div className="mt-2 text-sm text-slate-700">{project.stakeholder_name ?? "—"}</div>
              {project.stakeholder_contact && <div className="mt-1 text-xs text-slate-600">Ansprechpartner: {project.stakeholder_contact}</div>}
              <div className="mt-2 text-xs text-slate-500">
                {(project.stakeholder_phone && `Tel: ${project.stakeholder_phone}`) || ""}
                {project.stakeholder_mobile ? ` • Mobil: ${project.stakeholder_mobile}` : ""}
                {project.stakeholder_email ? ` • Mail: ${project.stakeholder_email}` : ""}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-700" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Programm
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {[
                  project.program_borehole ? "Bohrlochsondierung" : null,
                  project.program_surface ? "Oberflächensondierung" : null,
                  project.program_ramming ? "Rammsondierung" : null,
                ]
                  .filter(Boolean)
                  .join(" • ") || "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-700" aria-hidden="true">
                  <path d="M7 3h10v4H7zM5 9h14v12H5zM8 13h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                Zeitraum
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"} bis{" "}
                {project.end_date ? new Date(project.end_date).toLocaleDateString() : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-700" aria-hidden="true">
                  <path d="M6 5h12v14H6zM8 9h8M8 13h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Notizen
              </div>
              <div className="mt-2 text-xs text-slate-500">{project.notes || "—"}</div>
            </div>
          </div>
        </SectionCard>
      )}

      {role === "owner" && (
        <SectionCard
          title="Team"
          subtitle="Mitgliederverwaltung für dieses Projekt"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M8 11a4 4 0 1 1 8 0 4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M3 20a6 6 0 0 1 18 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="text-sm font-semibold text-slate-800">Mitglied hinzufügen</div>
              <div className="text-xs text-slate-500">Nur existierende Nutzer können hinzugefügt werden.</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="min-w-[240px] flex-1 rounded-xl border border-slate-200/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="E-Mail des Users"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addMemberByEmail}
              disabled={addingMember}
            >
              {addingMember ? "Füge hinzu…" : "Hinzufügen"}
            </button>
          </div>
          {memberErr && <div className="mt-2 text-xs text-red-600">{memberErr}</div>}
          {memberOk && <div className="mt-2 text-xs text-green-700">{memberOk}</div>}
        </SectionCard>
      )}

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <SectionCard
          title="Projekt‑Stream"
          subtitle="Alles an einem Ort: Berichte & Dateien"
          action={
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
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    filter === f.id
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200/70 text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <div
            className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/40 p-6 text-center text-sm text-slate-600"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              uploadFiles(e.dataTransfer.files);
            }}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-600 ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M12 4v10M8 8l4-4 4 4M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="mt-3 font-medium text-slate-800">Dateien hier ablegen</div>
            <div className="mt-1 text-xs text-slate-500">
              PDF, Bilder, Excel, CSV, DOCX … bis {maxFileSizeMb} MB
            </div>

            <label className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
              <div className="mt-2 text-xs text-slate-500">Upload läuft…</div>
            )}
            {filesErr && (
              <div className="mt-2 text-xs text-red-600">{filesErr}</div>
            )}
          </div>

          <div className="mt-5">
            {filesLoading ? (
              <p className="text-sm text-slate-600">Lade Dateien…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-600">Noch keine Inhalte vorhanden.</p>
            ) : (
              <ul className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70">
                {items.map((item) =>
                  item.type === "report" ? (
                    <li key={`r-${item.id}`} className="p-4">
                      <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                        <div className="min-w-0 flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                              <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                              <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-800">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {new Date(item.created_at).toLocaleString()}
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                              <span>Status</span>
                              <span className="rounded-full border border-slate-200/70 px-2 py-0.5">{item.status ?? "—"}</span>
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${typeBadge(item.report_type).cls}`}>
                                {typeBadge(item.report_type).label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={
                              item.report_type === "schichtenverzeichnis"
                                ? `/api/pdf/schichtenverzeichnis/${item.id}`
                                : `/api/pdf/tagesbericht/${item.id}`
                            }
                            target="_blank"
                            className="btn btn-secondary btn-xs"
                          >
                            Öffnen
                          </Link>
                          {canEditOrDelete({ id: item.id, title: item.title, created_at: item.created_at, user_id: "", status: item.status ?? null }) && (
                            <Link
                              href={
                                item.report_type === "schichtenverzeichnis"
                                  ? `/projects/${projectId}/reports/schichtenverzeichnis/${item.id}/edit`
                                  : `/projects/${projectId}/reports/${item.id}/edit`
                              }
                              className="btn btn-secondary btn-xs"
                              title="Bearbeiten"
                            >
                              Bearbeiten
                            </Link>
                          )}
                          {canEditOrDelete({ id: item.id, title: item.title, created_at: item.created_at, user_id: "", status: item.status ?? null }) && (
                            <button
                              type="button"
                              className="btn btn-danger btn-xs"
                              onClick={() => deleteReport(item.id)}
                            >
                              Löschen
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ) : (
                    <li key={`f-${item.name}`} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-[10px] font-semibold ring-1 ${fileBadgeClass(item.name)}`}>
                          {fileBadge(item.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {new Date(item.created_at).toLocaleString()} • {(item.size ? Math.round(item.size / 1024) : 0)} KB
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => openFile(item.name)}
                        >
                          Öffnen
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          onClick={() => deleteFile(item.name)}
                        >
                          Löschen
                        </button>
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </SectionCard>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Projekt‑Details</h3>
                <p className="text-xs text-gray-500">Zusätzliche Angaben wie im Formular</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSettingsOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projektnummer *</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.project_number ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, project_number: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projektname *</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.name ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-gray-600">Auftraggeber *</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_name ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_name: e.target.value }))}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-gray-600">Adresse Auftraggeber</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_address ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_address: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Ansprechpartner Auftraggeber</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_contact ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_contact: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Tel.</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_phone ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_phone: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Mobil</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_mobile ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_mobile: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Mail</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.client_email ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, client_email: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-gray-600">Gutachter / Beteiligte</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.stakeholder_name ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, stakeholder_name: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Ansprechpartner Gutachter</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.stakeholder_contact ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, stakeholder_contact: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Tel.</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.stakeholder_phone ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, stakeholder_phone: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Mobil</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.stakeholder_mobile ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, stakeholder_mobile: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Mail</span>
                <input
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.stakeholder_email ?? ""}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, stakeholder_email: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Programm</div>
                {[
                  { id: "program_borehole", label: "Bohrlochsondierung" },
                  { id: "program_surface", label: "Oberflächensondierung" },
                  { id: "program_ramming", label: "Rammsondierung" },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean((settingsForm as any)[opt.id])}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          [opt.id]: e.target.checked,
                        }))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">Status</span>
                <select
                  className="w-full rounded-xl border p-2.5"
                  value={settingsForm.status ?? "geplant"}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  {["geplant", "laufend", "pausiert", "abgeschlossen"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <label className="space-y-1">
                  <span className="text-sm text-gray-600">Startdatum</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border p-2.5"
                    value={settingsForm.start_date ?? ""}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-gray-600">Enddatum</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border p-2.5"
                    value={settingsForm.end_date ?? ""}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  />
                </label>
              </div>
            </div>

            <label className="mt-5 block space-y-1">
              <span className="text-sm text-gray-600">Sonstiges / Anmerkungen</span>
              <textarea
                className="w-full rounded-xl border p-2.5"
                rows={3}
                value={settingsForm.notes ?? ""}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>

            {settingsError && <div className="mt-3 text-xs text-red-600">{settingsError}</div>}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSettingsOpen(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
