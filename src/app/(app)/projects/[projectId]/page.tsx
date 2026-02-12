"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Calendar, ClipboardList, Crown, ExternalLink, FileText, Hash, Link2, List, MapPin, Settings, Upload, User, Users } from "lucide-react";
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
  mymaps_url?: string | null;
  mymaps_title?: string | null;
  owner_id?: string | null;
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
type TeamMember = {
  user_id: string;
  role_in_project: string | null;
  profiles?: { email?: string | null; full_name?: string | null } | null;
};
type UserOption = {
  id: string;
  email: string;
};

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string } | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
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
    mymaps_url: "",
    mymaps_title: "",
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
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [memberOk, setMemberOk] = useState<string | null>(null);
  const [mymapsUrlInput, setMymapsUrlInput] = useState("");
  const [mymapsSaving, setMymapsSaving] = useState(false);
  const [mymapsError, setMymapsError] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

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
        "owner_id",
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
        "mymaps_url",
        "mymaps_title",
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
      mymaps_url: projectRow.mymaps_url ?? "",
      mymaps_title: projectRow.mymaps_title ?? "",
    }));
    setMymapsUrlInput(projectRow.mymaps_url ?? "");

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

    // 3) Team laden
    setTeamLoading(true);
    setTeamError(null);
    const { data: members, error: membersErr } = await supabase
      .from("project_members")
      .select("user_id, role_in_project")
      .eq("project_id", projectId);

    const ownerId = projectRow.owner_id ?? null;
    const baseMembers = (members ?? []) as Array<{ user_id: string; role_in_project: string | null }>;
    const hasOwnerRow = ownerId ? baseMembers.some((m) => m.user_id === ownerId) : false;
    const withOwner = ownerId && !hasOwnerRow ? [...baseMembers, { user_id: ownerId, role_in_project: "owner" }] : baseMembers;

    if (membersErr) {
      setTeamError("Team laden fehlgeschlagen: " + membersErr.message);
      setTeamMembers(
        ownerId
          ? [{ user_id: ownerId, role_in_project: "owner", profiles: null }]
          : []
      );
      setTeamLoading(false);
    } else {
      const ids = Array.from(new Set(withOwner.map((m) => m.user_id)));
      let emailMap = new Map<string, { email?: string | null }>();

      const { data: emails, error: emailsErr } = await supabase.rpc("get_project_member_emails", {
        p_project_id: projectId,
      });
      if (!emailsErr && Array.isArray(emails)) {
        emailMap = new Map(emails.map((row: any) => [row.user_id as string, { email: row.email }]));
      } else {
        const { data: profiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("id,email")
          .in("id", ids);
        if (profilesErr) {
          setTeamError("Profile laden fehlgeschlagen: " + profilesErr.message);
        } else {
          emailMap = new Map((profiles ?? []).map((p: any) => [p.id as string, { email: p.email }]));
        }
      }

      setTeamMembers(
        withOwner.map((m) => ({
          ...m,
          profiles: emailMap.get(m.user_id) ?? null,
        })) as TeamMember[]
      );

      setTeamLoading(false);
    }

    // 4) Alle Nutzer für Mitgliederauswahl laden (falls Rechte vorhanden)
    setUsersLoading(true);
    setUsersErr(null);
    const { data: usersData, error: usersError } = await supabase
      .from("profiles")
      .select("id,email")
      .not("email", "is", null)
      .order("email", { ascending: true })
      .limit(5000);
    if (usersError) {
      setUsersErr("Mitgliederliste konnte nicht geladen werden.");
      setAllUsers([]);
    } else {
      const mapped = (usersData ?? [])
        .map((u: any) => ({ id: String(u.id ?? ""), email: String(u.email ?? "").trim() }))
        .filter((u: UserOption) => Boolean(u.id) && Boolean(u.email));
      setAllUsers(mapped);
    }
    setUsersLoading(false);

    // 5) Reports laden
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

    // 6) Dateien laden
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
      mymaps_url: settingsForm.mymaps_url?.trim() || null,
      mymaps_title: settingsForm.mymaps_title?.trim() || null,
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

    setProject(data as unknown as Project);
    setSettingsOpen(false);
    setSavingSettings(false);
  };

  const isProbablyUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const resolveMymapsTitle = async (url: string) => {
    const res = await fetch(`/api/mymaps/resolve?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error("Titel konnte nicht geladen werden.");
    const data = (await res.json()) as { title?: string | null };
    return data.title?.trim() || "Google My Maps";
  };

  const saveMymapsLink = async () => {
    const url = mymapsUrlInput.trim();
    if (!url) {
      setMymapsError("Bitte einen Link einfügen.");
      return;
    }
    if (!isProbablyUrl(url)) {
      setMymapsError("Ungültiger Link.");
      return;
    }

    setMymapsError(null);
    setMymapsSaving(true);
    try {
      const title = await resolveMymapsTitle(url);
      const { data, error } = await supabase
        .from("projects")
        .update({ mymaps_url: url, mymaps_title: title })
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
          "mymaps_url",
          "mymaps_title",
        ].join(","))
        .single();

      if (error) {
        setMymapsError("Speichern fehlgeschlagen: " + error.message);
        return;
      }

      setProject(data as unknown as Project);
    } catch (err) {
      setMymapsError(err instanceof Error ? err.message : "Link konnte nicht gespeichert werden.");
    } finally {
      setMymapsSaving(false);
    }
  };

  const removeMymapsLink = async () => {
    setMymapsError(null);
    setMymapsSaving(true);
    const { data, error } = await supabase
      .from("projects")
      .update({ mymaps_url: null, mymaps_title: null })
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
        "mymaps_url",
        "mymaps_title",
      ].join(","))
      .single();

    if (error) {
      setMymapsError("Entfernen fehlgeschlagen: " + error.message);
      setMymapsSaving(false);
      return;
    }

    setProject(data as unknown as Project);
    setMymapsUrlInput("");
    setMymapsSaving(false);
  };

  const isOwner = role === "owner" || (project?.owner_id && me?.id && project.owner_id === me.id);
  const sortedTeam = useMemo(() => {
    const list = [...teamMembers];
    list.sort((a, b) => {
      const ar = a.role_in_project === "owner" ? 0 : 1;
      const br = b.role_in_project === "owner" ? 0 : 1;
      if (ar !== br) return ar - br;
      const an = (a.profiles?.full_name || a.profiles?.email || a.user_id || "").toLowerCase();
      const bn = (b.profiles?.full_name || b.profiles?.email || b.user_id || "").toLowerCase();
      return an.localeCompare(bn);
    });
    return list;
  }, [teamMembers]);

  const getMymapsEmbedUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl);
      if (!/google\./i.test(url.hostname)) return rawUrl;
      if (!/\/maps\/d\//i.test(url.pathname)) return rawUrl;
      if (url.pathname.includes("/embed")) return url.toString();
      url.pathname = url.pathname.replace("/edit", "/embed");
      return url.toString();
    } catch {
      return rawUrl;
    }
  };

  const canEditOrDelete = (r: ReportRow) => {
    if (!me) return false;
    const isCreator = r.user_id === me.id;
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

  const deleteProject = async () => {
    if (!isOwner || !project) return;
    const name = (project.name ?? "").trim();
    if (!name) {
      alert("Projektname fehlt. Löschen abgebrochen.");
      return;
    }
    const typed = prompt(`Zum Löschen bitte den Projektnamen eingeben:\n${name}`);
    if (typed == null) return;
    if (typed.trim() !== name) {
      alert("Projektname stimmt nicht. Löschen abgebrochen.");
      return;
    }
    if (!confirm("Projekt wirklich löschen? Zugehörige Mitglieder und Dateien werden entfernt.")) return;

    setDeletingProject(true);
    try {
      // Reports bleiben erhalten, werden aber aus dem Projekt gelöst.
      const { error: reportErr } = await supabase
        .from("reports")
        .update({ project_id: null })
        .eq("project_id", projectId);
      if (reportErr) {
        alert("Reports konnten nicht aus dem Projekt gelöst werden: " + reportErr.message);
        return;
      }

      const { error: memberErr } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId);
      if (memberErr) {
        alert("Projektmitglieder konnten nicht entfernt werden: " + memberErr.message);
        return;
      }

      const { data: fileList, error: listErr } = await supabase.storage
        .from("dropData")
        .list(`${projectId}/`, { limit: 1000, offset: 0 });
      if (listErr) {
        alert("Projektdateien konnten nicht geladen werden: " + listErr.message);
        return;
      }
      const filePaths = (fileList ?? [])
        .map((f) => f.name)
        .filter(Boolean)
        .map((name) => `${projectId}/${name}`);
      if (filePaths.length) {
        const { error: removeErr } = await supabase.storage.from("dropData").remove(filePaths);
        if (removeErr) {
          alert("Projektdateien konnten nicht gelöscht werden: " + removeErr.message);
          return;
        }
      }

      const { error: projectErr } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);
      if (projectErr) {
        alert("Projekt löschen fehlgeschlagen: " + projectErr.message);
        return;
      }

      alert("Projekt gelöscht ✅");
      window.location.href = "/projects";
    } finally {
      setDeletingProject(false);
    }
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

  const addSelectedMembers = async () => {
    const ids = Array.from(new Set(selectedMemberIds.filter(Boolean)));
    if (!ids.length) {
      setMemberErr("Bitte mindestens ein Mitglied auswählen.");
      return;
    }

    setAddingMember(true);
    setMemberErr(null);
    setMemberOk(null);
    try {
      const rows = ids.map((userId) => ({
        project_id: projectId,
        user_id: userId,
        role_in_project: "member",
      }));

      const { error } = await supabase
        .from("project_members")
        .upsert(rows, { onConflict: "project_id,user_id", ignoreDuplicates: true });

      if (error) {
        setMemberErr("Hinzufügen fehlgeschlagen: " + error.message);
        return;
      }

      setSelectedMemberIds([]);
      setMemberOk("Mitglieder hinzugefügt ✅");
      await load();
    } finally {
      setAddingMember(false);
    }
  };

  const toggleSelectedMember = (userId: string, checked: boolean) => {
    setSelectedMemberIds((prev) => {
      if (checked) return Array.from(new Set([...prev, userId]));
      return prev.filter((id) => id !== userId);
    });
  };

  const availableUserOptions = useMemo(() => {
    const existing = new Set(teamMembers.map((m) => m.user_id));
    const q = memberQuery.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (existing.has(u.id)) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q);
    });
  }, [allUsers, teamMembers, memberQuery]);

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
                <Hash className="h-4 w-4" aria-hidden="true" />
                {project?.project_number ? `Nr. ${project.project_number}` : projectId}
              </span>
              {project?.client_name && (
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                  <Briefcase className="h-4 w-4" aria-hidden="true" />
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
                <Settings className="h-4 w-4" aria-hidden="true" />
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
              href={`/projects/${projectId}/reports/schichtenverzeichnis/step`}
              className="btn btn-secondary"
            >
              + Schichtenverzeichnis
            </Link>
            {isOwner ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={deleteProject}
                disabled={deletingProject}
                title="Projekt dauerhaft löschen"
              >
                {deletingProject ? "Lösche…" : "Projekt löschen"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {!loading && !err && project && (
        <SectionCard
          title="Projektübersicht"
          subtitle="Erweiterte Angaben aus dem Formular"
          action={
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Status: {project.status ?? "—"}
            </span>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Briefcase className="h-4 w-4 text-sky-700" aria-hidden="true" />
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
                <Users className="h-4 w-4 text-sky-700" aria-hidden="true" />
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
                <List className="h-4 w-4 text-sky-700" aria-hidden="true" />
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
                <Calendar className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Zeitraum
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"} bis{" "}
                {project.end_date ? new Date(project.end_date).toLocaleDateString() : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FileText className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Notizen
              </div>
              <div className="mt-2 text-xs text-slate-500">{project.notes || "—"}</div>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Team"
          subtitle="Mitgliederverwaltung für dieses Projekt"
        >
          {isOwner ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-200">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-[240px]">
                  <div className="text-sm font-semibold text-slate-800">Mitglieder auswählen</div>
                  <div className="text-xs text-slate-500">Mail auswählen und gesammelt hinzufügen.</div>
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-xl border border-slate-200/70 bg-white p-3">
                <input
                  className="w-full rounded-xl border border-slate-200/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Mitglieder suchen (E-Mail)…"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-100 p-2">
                  {usersLoading ? (
                    <div className="px-2 py-1 text-xs text-slate-500">Lade Nutzer…</div>
                  ) : usersErr ? (
                    <div className="px-2 py-1 text-xs text-amber-700">{usersErr}</div>
                  ) : availableUserOptions.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-slate-500">Keine passenden Nutzer verfügbar.</div>
                  ) : (
                    availableUserOptions.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(u.id)}
                          onChange={(e) => toggleSelectedMember(u.id, e.target.checked)}
                        />
                        <span className="truncate text-slate-700">{u.email}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">
                    Ausgewählt: {selectedMemberIds.length}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addSelectedMembers}
                    disabled={addingMember || selectedMemberIds.length === 0}
                  >
                    {addingMember ? "Füge hinzu…" : "Ausgewählte hinzufügen"}
                  </button>
                </div>
              </div>

              {usersErr ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="min-w-[240px] flex-1 rounded-xl border border-slate-200/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="Fallback: E-Mail des Users"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addMemberByEmail}
                    disabled={addingMember}
                  >
                    {addingMember ? "Füge hinzu…" : "Per E-Mail hinzufügen"}
                  </button>
                </div>
              ) : null}
              {memberErr && <div className="mt-2 text-xs text-red-600">{memberErr}</div>}
              {memberOk && <div className="mt-2 text-xs text-green-700">{memberOk}</div>}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="text-xs text-slate-500">Nur der Projekt‑Owner kann Mitglieder hinzufügen.</div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-200/70 bg-white">
            <div className="border-b border-slate-200/70 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Mitglieder
            </div>
            <div className="divide-y divide-slate-100">
              {teamLoading ? (
                <div className="px-4 py-3 text-sm text-slate-600">Lade Team…</div>
              ) : teamError ? (
                <div className="px-4 py-3 text-sm text-red-600">{teamError}</div>
              ) : sortedTeam.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">Noch keine Mitglieder.</div>
              ) : (
                sortedTeam.map((m) => {
                  const isMemberOwner = m.role_in_project === "owner";
                  const email = m.profiles?.email?.trim() || "";
                  return (
                    <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {email || "E-Mail unbekannt"}
                        </div>
                        {!email ? <div className="truncate text-xs text-slate-500">{m.user_id}</div> : null}
                      </div>
                      <div className="ml-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold">
                        {isMemberOwner ? (
                          <>
                            <Crown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                            Owner
                          </>
                        ) : (
                          <>
                            <User className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            Mitglied
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Google My Maps"
          subtitle="Projektkarte als Link speichern und öffnen"
        >
          <div className="rounded-2xl border border-dashed border-slate-200/70 p-4">
            {isOwner ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">My Maps Link</div>
                    <div className="text-xs text-slate-500">Link einfügen oder hier hineinziehen.</div>
                  </div>
                </div>

                <div
                  className="mt-3 rounded-xl border border-slate-200/70 bg-white p-3 text-xs text-slate-500"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const text = e.dataTransfer.getData("text");
                    if (text) setMymapsUrlInput(text.trim());
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    <input
                      className="w-full border-0 bg-transparent p-0 text-sm text-slate-700 outline-none"
                      placeholder="https://www.google.com/maps/d/..."
                      value={mymapsUrlInput}
                      onChange={(e) => setMymapsUrlInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={saveMymapsLink}
                    disabled={mymapsSaving}
                  >
                    {mymapsSaving ? "Speichert…" : "Link speichern"}
                  </button>
                  {project?.mymaps_url ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={removeMymapsLink}
                      disabled={mymapsSaving}
                    >
                      Entfernen
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Projektkarte</div>
                  <div className="text-xs text-slate-500">
                    Nur der Projekt‑Owner kann den Link bearbeiten.
                  </div>
                </div>
              </div>
            )}
            {mymapsError && <div className="mt-2 text-xs text-red-600">{mymapsError}</div>}

            {project?.mymaps_url && (
              <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {project.mymaps_title || "Google My Maps"}
                    </div>
                    {isOwner ? (
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {project.mymaps_url}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200/70">
                  <div className="aspect-[4/3] w-full">
                    <iframe
                      title={project.mymaps_title || "Google My Maps"}
                      src={getMymapsEmbedUrl(project.mymaps_url)}
                      className="h-full w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

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
              <Upload className="h-5 w-5" aria-hidden="true" />
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
                            <FileText className="h-5 w-5" aria-hidden="true" />
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
                                ? `/projects/${projectId}/reports/schichtenverzeichnis/step/${item.id}/edit`
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
