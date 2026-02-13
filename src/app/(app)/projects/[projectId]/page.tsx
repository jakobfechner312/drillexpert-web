"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, Calendar, ClipboardList, CloudSun, Crown, ExternalLink, FileText, Hash, Link2, List, MapPin, RefreshCcw, Settings, Upload, User, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Project = {
  id: string;
  name: string;
  created_by?: string | null;
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
type SettingsFocus = "all" | "client" | "stakeholder" | "program" | "zeitraum" | "notes";
type ProjectNoteEntry = {
  id: string;
  text: string;
  created_at: string;
  done?: boolean;
  author_id?: string | null;
  author_email?: string | null;
};

type ProjectWeather = {
  latitude: number;
  longitude: number;
  locationName: string | null;
  current: {
    temperatureC: number | null;
    windKmh: number | null;
    weatherCode: number | null;
    time: string | null;
  };
  today: {
    tempMaxC: number | null;
    tempMinC: number | null;
    precipitationMm: number | null;
  };
};

function parseProjectNotes(raw: string | null | undefined): ProjectNoteEntry[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry, index) => {
        const row = entry as Record<string, unknown>;
        const text = typeof row.text === "string" ? row.text.trim() : "";
        if (!text) return null;
        return {
          id: typeof row.id === "string" ? row.id : `note-${index}`,
          text,
          created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
          done: Boolean(row.done),
          author_id: typeof row.author_id === "string" ? row.author_id : null,
          author_email: typeof row.author_email === "string" ? row.author_email : null,
        } as ProjectNoteEntry;
      })
      .filter((entry): entry is ProjectNoteEntry => Boolean(entry))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    return [
      {
        id: "legacy-note",
        text: trimmed,
        created_at: new Date(0).toISOString(),
        done: false,
        author_id: null,
        author_email: "Altbestand",
      },
    ];
  }
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string; email?: string | null } | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>("all");
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
  const memberEmailInputRef = useRef<HTMLInputElement | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [memberOk, setMemberOk] = useState<string | null>(null);
  const [promotingOwnerId, setPromotingOwnerId] = useState<string | null>(null);
  const [mymapsUrlInput, setMymapsUrlInput] = useState("");
  const [mymapsSaving, setMymapsSaving] = useState(false);
  const [mymapsError, setMymapsError] = useState<string | null>(null);
  const [projectWeather, setProjectWeather] = useState<ProjectWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const notesInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [projectNotes, setProjectNotes] = useState<ProjectNoteEntry[]>([]);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOk, setNotesOk] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const openNativePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      pickerInput.showPicker?.();
    } catch {
      // Fallback: Browser opens picker natively when supported.
    }
  };

  const formatProjectDisplayName = (value: { name?: string | null; project_number?: string | null } | null | undefined) => {
    const nr = (value?.project_number ?? "").trim();
    const name = (value?.name ?? "").trim();
    if (nr && name) return `${nr} - ${name}`;
    return name || nr || "Projekt";
  };

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
    setMe({ id: user.id, email: user.email ?? null });

    // 1) Projekt laden
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select([
        "id",
        "name",
        "owner_id",
        "created_by",
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
    setProjectNotes(parseProjectNotes(projectRow.notes));
    setNotesInput("");
    setNotesError(null);
    setNotesOk(null);

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

  const loadProjectWeather = async (mymapsUrl: string) => {
    if (!mymapsUrl) {
      setProjectWeather(null);
      setWeatherError(null);
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch(`/api/project-weather?mymapsUrl=${encodeURIComponent(mymapsUrl)}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as ProjectWeather | { error?: string };
      if (!res.ok || !("current" in payload)) {
        setProjectWeather(null);
        setWeatherError(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Wetterdaten konnten nicht geladen werden."
        );
        return;
      }
      setProjectWeather(payload);
    } catch {
      setProjectWeather(null);
      setWeatherError("Wetterdaten konnten nicht geladen werden.");
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    const url = project?.mymaps_url?.trim();
    if (!url) {
      setProjectWeather(null);
      setWeatherError(null);
      return;
    }
    loadProjectWeather(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.mymaps_url]);

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
        "owner_id",
        "created_by",
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

  const openSettingsFor = (focus: SettingsFocus) => {
    setSettingsFocus(focus);
    setSettingsOpen(true);
  };
  const isSettingsSectionVisible = (section: Exclude<SettingsFocus, "all">) =>
    settingsFocus === "all" || settingsFocus === section;

  const saveProjectNotes = async () => {
    if (!project) return;
    const text = notesInput.trim();
    if (!text) {
      setNotesError("Bitte zuerst eine Notiz eingeben.");
      return;
    }

    setNotesSaving(true);
    setNotesError(null);
    setNotesOk(null);

    const { data: currentRow, error: currentErr } = await supabase
      .from("projects")
      .select("notes")
      .eq("id", projectId)
      .single();

    if (currentErr) {
      setNotesError("Aktuelle Notizen konnten nicht geladen werden: " + currentErr.message);
      setNotesSaving(false);
      return;
    }

    const currentEntries = parseProjectNotes((currentRow as { notes?: string | null } | null)?.notes ?? "");
    const nextEntry: ProjectNoteEntry = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `note-${Date.now()}`,
      text,
      created_at: new Date().toISOString(),
      done: false,
      author_id: me?.id ?? null,
      author_email: me?.email ?? null,
    };
    const nextEntries = [nextEntry, ...currentEntries].slice(0, 300);

    const { data, error } = await supabase
      .from("projects")
      .update({ notes: JSON.stringify(nextEntries) })
      .eq("id", projectId)
      .select("id,notes")
      .single();

    if (error) {
      setNotesError("Notizen konnten nicht gespeichert werden: " + error.message);
      setNotesSaving(false);
      return;
    }

    const savedNotesRaw = (data as { notes?: string | null } | null)?.notes ?? "";
    const savedEntries = parseProjectNotes(savedNotesRaw);
    setProject((prev) => (prev ? { ...prev, notes: savedNotesRaw } : prev));
    setProjectNotes(savedEntries);
    setNotesInput("");
    setNotesOk("Notiz gespeichert ✅");
    setNotesSaving(false);
  };

  const persistProjectNotes = async (entries: ProjectNoteEntry[], okMessage: string) => {
    setNotesSaving(true);
    setNotesError(null);
    setNotesOk(null);
    const { data, error } = await supabase
      .from("projects")
      .update({ notes: JSON.stringify(entries) })
      .eq("id", projectId)
      .select("id,notes")
      .single();

    if (error) {
      setNotesError("Notizen konnten nicht gespeichert werden: " + error.message);
      setNotesSaving(false);
      return;
    }

    const savedNotesRaw = (data as { notes?: string | null } | null)?.notes ?? "";
    const savedEntries = parseProjectNotes(savedNotesRaw);
    setProject((prev) => (prev ? { ...prev, notes: savedNotesRaw } : prev));
    setProjectNotes(savedEntries);
    setNotesOk(okMessage);
    setNotesSaving(false);
  };

  const removeProjectNote = async (noteId: string) => {
    if (!isOwner) return;
    const nextEntries = projectNotes.filter((entry) => entry.id !== noteId);
    await persistProjectNotes(nextEntries, "Notiz gelöscht ✅");
  };

  const toggleProjectNoteDone = async (noteId: string) => {
    if (!isOwner) return;
    const nextEntries = projectNotes.map((entry) =>
      entry.id === noteId ? { ...entry, done: !entry.done } : entry
    );
    await persistProjectNotes(nextEntries, "Notiz aktualisiert ✅");
  };

  const handleNotesInputChange = (value: string) => {
    const next = value.slice(0, 1500);
    setNotesInput(next);
    if (notesError) setNotesError(null);
    if (notesOk) setNotesOk(null);

    // Keep cursor stable on mobile Safari while state updates/re-renders.
    requestAnimationFrame(() => {
      const input = notesInputRef.current;
      if (!input) return;
      if (document.activeElement !== input) input.focus();
      const pos = Math.min(next.length, input.value.length);
      input.setSelectionRange(pos, pos);
    });
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
          "owner_id",
          "created_by",
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
        "owner_id",
        "created_by",
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

  const isOwner = role === "owner";
  const isProjectCreator = Boolean(project?.created_by && me?.id && project.created_by === me.id);
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
    const displayName = formatProjectDisplayName(project);
    const rawName = (project.name ?? "").trim();
    if (!rawName) {
      alert("Projektname fehlt. Löschen abgebrochen.");
      return;
    }
    const typed = prompt(`Zum Löschen bitte den Projektnamen eingeben:\n${displayName}`);
    if (typed == null) return;
    const normalized = typed.trim();
    if (normalized !== rawName && normalized !== displayName) {
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
    if (!isOwner) {
      setMemberErr("Nur der Projekt-Owner darf Berechtigungen ändern.");
      setMemberOk(null);
      return;
    }
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

  const demoteOwnerToMember = async (memberUserId: string) => {
    if (!isProjectCreator) {
      setMemberErr("Nur der Projektersteller darf Owner zurückstufen.");
      setMemberOk(null);
      return;
    }
    const creatorId = project?.created_by ?? null;
    if (!memberUserId) {
      setMemberErr("Ungültiges Mitglied.");
      setMemberOk(null);
      return;
    }
    if (creatorId && memberUserId === creatorId) {
      setMemberErr("Der Projektersteller kann nicht zurückgestuft werden.");
      setMemberOk(null);
      return;
    }

    const ownerIds = teamMembers
      .filter((m) => m.role_in_project === "owner")
      .map((m) => m.user_id);
    if (!ownerIds.includes(memberUserId)) {
      setMemberOk("Dieses Mitglied ist bereits kein Owner.");
      return;
    }
    if (ownerIds.length <= 1) {
      setMemberErr("Mindestens ein Owner muss im Projekt bleiben.");
      setMemberOk(null);
      return;
    }
    if (!confirm("Owner-Recht für dieses Mitglied wirklich entfernen?")) return;

    setPromotingOwnerId(memberUserId);
    setMemberErr(null);
    setMemberOk("Owner-Recht wird entfernt…");

    try {
      const { error: demoteErr } = await supabase
        .from("project_members")
        .update({ role_in_project: "member" })
        .eq("project_id", projectId)
        .eq("user_id", memberUserId);
      if (demoteErr) {
        setMemberErr("Zurückstufen fehlgeschlagen: " + demoteErr.message);
        setMemberOk(null);
        return;
      }

      // Keep projects.owner_id valid when the canonical owner was demoted.
      if (project?.owner_id && project.owner_id === memberUserId) {
        const fallbackOwnerId =
          (creatorId && creatorId !== memberUserId ? creatorId : null) ??
          ownerIds.find((id) => id !== memberUserId) ??
          null;

        if (fallbackOwnerId) {
          const { error: ownerErr } = await supabase
            .from("projects")
            .update({ owner_id: fallbackOwnerId })
            .eq("id", projectId);
          if (ownerErr) {
            setMemberErr("Owner-Feld im Projekt konnte nicht aktualisiert werden: " + ownerErr.message);
            setMemberOk(null);
            return;
          }
          setProject((prev) => (prev ? { ...prev, owner_id: fallbackOwnerId } : prev));
        }
      }

      setTeamMembers((prev) =>
        prev.map((m) => (m.user_id === memberUserId ? { ...m, role_in_project: "member" } : m))
      );
      setMemberOk("Owner-Recht entfernt ✅");
      await load();
    } finally {
      setPromotingOwnerId(null);
    }
  };

  const promoteMemberToOwner = async (memberUserId: string) => {
    if (!isOwner) {
      setMemberErr("Nur der aktuelle Owner darf einen neuen Owner ernennen.");
      return;
    }
    const { data: ownerCheck, error: ownerCheckErr } = await supabase
      .from("project_members")
      .select("role_in_project")
      .eq("project_id", projectId)
      .eq("user_id", me?.id ?? "")
      .maybeSingle();
    if (ownerCheckErr || ownerCheck?.role_in_project !== "owner") {
      setMemberErr("Du bist in diesem Projekt kein Owner.");
      setMemberOk(null);
      return;
    }
    if (!memberUserId) {
      setMemberErr("Ungültiges Mitglied.");
      return;
    }
    const alreadyOwner = teamMembers.some((m) => m.user_id === memberUserId && m.role_in_project === "owner");
    if (alreadyOwner) {
      setMemberOk("Dieses Mitglied ist bereits Owner.");
      return;
    }
    if (!confirm("Dieses Mitglied wirklich zum Owner machen?")) return;

    setPromotingOwnerId(memberUserId);
    setMemberErr(null);
    setMemberOk("Owner wird aktualisiert…");

    try {
      const { error: promoteErr } = await supabase
        .from("project_members")
        .update({ role_in_project: "owner" })
        .eq("project_id", projectId)
        .eq("user_id", memberUserId);

      if (promoteErr) {
        setMemberErr("Owner setzen fehlgeschlagen: " + promoteErr.message);
        setMemberOk(null);
        return;
      }

      // Immediate UI update so badge changes instantly.
      setTeamMembers((prev) =>
        prev.map((m) => {
          if (m.user_id === memberUserId) return { ...m, role_in_project: "owner" };
          return m;
        })
      );
      setMemberOk("Owner hinzugefügt ✅");
      await load();
    } catch (e) {
      setMemberErr(e instanceof Error ? e.message : "Owner-Wechsel fehlgeschlagen.");
      setMemberOk(null);
    } finally {
      setPromotingOwnerId(null);
    }
  };

  const handleMemberEmailChange = (value: string) => {
    setMemberEmail(value);

    // Keep focus stable on iOS/Safari where rerenders may drop caret unexpectedly.
    requestAnimationFrame(() => {
      const input = memberEmailInputRef.current;
      if (!input) return;
      if (document.activeElement !== input) {
        input.focus();
      }
      const pos = value.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const addSelectedMembers = async () => {
    if (!isOwner) {
      setMemberErr("Nur der Projekt-Owner darf Berechtigungen ändern.");
      setMemberOk(null);
      return;
    }
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

  const availableUserOptions = useMemo(() => {
    const existing = new Set(teamMembers.map((m) => m.user_id));
    return allUsers.filter((u) => {
      if (existing.has(u.id)) return false;
      return true;
    });
  }, [allUsers, teamMembers]);

  const myMapsEmbedUrl = useMemo(() => getMymapsEmbedUrl(project?.mymaps_url), [project?.mymaps_url]);

  const weatherCodeLabel = (code: number | null | undefined) => {
    if (code == null) return "Unbekannt";
    if (code === 0) return "Klar";
    if ([1, 2, 3].includes(code)) return "Bewölkt";
    if ([45, 48].includes(code)) return "Nebel";
    if ([51, 53, 55, 56, 57].includes(code)) return "Niesel";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Regen";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Schnee";
    if ([95, 96, 99].includes(code)) return "Gewitter";
    return `Code ${code}`;
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
    if (type === "tagesbericht_rhein_main_link") return { label: "TB Rhein-Main-Link", cls: "bg-indigo-50 text-indigo-800 ring-indigo-200" };
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
              {formatProjectDisplayName(project)}
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
              onClick={() => openSettingsFor("all")}
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
              href={`/projects/${projectId}/reports/rhein-main-link/new`}
              className="btn btn-secondary"
            >
              + TB Rhein-Main-Link
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
            <button
              type="button"
              onClick={() => openSettingsFor("client")}
              className="rounded-xl border border-slate-200/70 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
            >
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
            </button>

            <button
              type="button"
              onClick={() => openSettingsFor("stakeholder")}
              className="rounded-xl border border-slate-200/70 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
            >
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
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => openSettingsFor("program")}
              className="rounded-xl border border-slate-200/70 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
            >
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
            </button>
            <button
              type="button"
              onClick={() => openSettingsFor("zeitraum")}
              className="rounded-xl border border-slate-200/70 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Calendar className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Zeitraum
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"} bis{" "}
                {project.end_date ? new Date(project.end_date).toLocaleDateString() : "—"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => openSettingsFor("notes")}
              className="rounded-xl border border-slate-200/70 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50/40"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FileText className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Notizen
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {projectNotes.length > 0 ? `${projectNotes.length} Notiz${projectNotes.length > 1 ? "en" : ""}` : "—"}
              </div>
              {projectNotes[0]?.text ? (
                <div className="mt-1 line-clamp-2 text-xs text-slate-600">{projectNotes[0].text}</div>
              ) : null}
            </button>
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
                  <div className="text-sm font-semibold text-slate-800">Mitglied per E-Mail hinzufügen</div>
                  <div className="text-xs text-slate-500">Schnelle, sichere Variante für den Live-Betrieb.</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  ref={memberEmailInputRef}
                  className="min-w-[240px] flex-1 rounded-xl border border-slate-200/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="E-Mail des Users"
                  value={memberEmail}
                  onChange={(e) => handleMemberEmailChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
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
                      <div className="ml-3 flex items-center gap-2">
                        {isOwner && !isMemberOwner ? (
                          <button
                            type="button"
                            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void promoteMemberToOwner(m.user_id)}
                            disabled={promotingOwnerId === m.user_id}
                          >
                            {promotingOwnerId === m.user_id ? "Setze…" : "Zum Owner machen"}
                          </button>
                        ) : null}
                        {isProjectCreator && isMemberOwner && m.user_id !== project?.created_by ? (
                          <button
                            type="button"
                            className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void demoteOwnerToMember(m.user_id)}
                            disabled={promotingOwnerId === m.user_id}
                          >
                            {promotingOwnerId === m.user_id ? "Entferne…" : "Owner entfernen"}
                          </button>
                        ) : null}
                        <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold">
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
              <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <CloudSun className="h-4 w-4 text-sky-600" aria-hidden="true" />
                    {`Wetter in ${projectWeather?.locationName?.trim() || project.mymaps_title?.trim() || project.name || "Projekt"}`}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => loadProjectWeather(project.mymaps_url ?? "")}
                    disabled={weatherLoading}
                  >
                    <span className="inline-flex items-center gap-1">
                      <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {weatherLoading ? "Lädt…" : "Aktualisieren"}
                    </span>
                  </button>
                </div>

                {weatherError ? <div className="text-xs text-amber-700">{weatherError}</div> : null}

                {!weatherError && projectWeather ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                      <div className="text-slate-500">Jetzt</div>
                      <div className="mt-0.5 font-semibold text-slate-800">
                        {projectWeather.current.temperatureC != null ? `${projectWeather.current.temperatureC} °C` : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                      <div className="text-slate-500">Heute Min/Max</div>
                      <div className="mt-0.5 font-semibold text-slate-800">
                        {projectWeather.today.tempMinC != null && projectWeather.today.tempMaxC != null
                          ? `${projectWeather.today.tempMinC} / ${projectWeather.today.tempMaxC} °C`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                      <div className="text-slate-500">Niederschlag</div>
                      <div className="mt-0.5 font-semibold text-slate-800">
                        {projectWeather.today.precipitationMm != null ? `${projectWeather.today.precipitationMm} mm` : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                      <div className="text-slate-500">Wetter / Wind</div>
                      <div className="mt-0.5 font-semibold text-slate-800">
                        {weatherCodeLabel(projectWeather.current.weatherCode)}
                        {projectWeather.current.windKmh != null ? ` · ${projectWeather.current.windKmh} km/h` : ""}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

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
                      src={myMapsEmbedUrl}
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

      {!loading && !err && project && (
        <SectionCard
          title="Bugs & Notizen"
          subtitle="Jede Speicherung erzeugt einen neuen Eintrag. Alle Mitglieder können hinzufügen."
          action={<span className="text-xs text-slate-500">{notesInput.length}/1500</span>}
        >
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <textarea
              ref={notesInputRef}
              value={notesInput}
              onChange={(e) => handleNotesInputChange(e.target.value)}
              placeholder="z. B. Offene Bugs, Rückfragen vom Bauleiter, nächste Schritte…"
              className="min-h-[120px] w-full rounded-xl border border-slate-200/70 px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">Neueste Notizen stehen oben.</div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={saveProjectNotes}
                disabled={notesSaving}
              >
                {notesSaving ? "Speichert…" : "Notiz speichern"}
              </button>
            </div>
            {notesError ? <div className="mt-2 text-xs text-red-600">{notesError}</div> : null}
            {notesOk ? <div className="mt-2 text-xs text-green-700">{notesOk}</div> : null}

            <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/50">
              <div className="border-b border-slate-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Verlauf
              </div>
              <div className="max-h-72 divide-y divide-slate-200/70 overflow-y-auto">
                {projectNotes.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">Noch keine Notizen vorhanden.</div>
                ) : (
                  projectNotes.map((entry) => {
                    const byMe = entry.author_id && me?.id && entry.author_id === me.id;
                    const author = byMe ? "von dir" : entry.author_email || "Mitglied";
                    return (
                      <div key={entry.id} className="px-3 py-3">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "rounded-full border px-2 py-0.5",
                                entry.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white",
                              ].join(" ")}
                            >
                              {entry.done ? "erledigt" : "offen"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">{author}</span>
                            <span>{new Date(entry.created_at).toLocaleString()}</span>
                          </div>
                          {isOwner ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                disabled={notesSaving}
                                onClick={() => toggleProjectNoteDone(entry.id)}
                              >
                                {entry.done ? "Unerledigt" : "Erledigt"}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                                disabled={notesSaving}
                                onClick={() => removeProjectNote(entry.id)}
                              >
                                Löschen
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div className={["whitespace-pre-wrap text-sm", entry.done ? "text-slate-500 line-through" : "text-slate-800"].join(" ")}>
                          {entry.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
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
                                : item.report_type === "tagesbericht_rhein_main_link"
                                  ? `/api/pdf/tagesbericht-rhein-main-link/${item.id}`
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
                                : item.report_type === "tagesbericht_rhein_main_link"
                                  ? `/projects/${projectId}/reports/rhein-main-link/${item.id}/edit`
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
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="mx-auto my-4 flex w-full max-w-3xl max-h-[calc(100vh-2rem)] flex-col rounded-2xl bg-white shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
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

            <div className="overflow-y-auto px-5 pb-4">
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex flex-wrap gap-2">
                {[
                  { id: "all", label: "Alle" },
                  { id: "client", label: "Auftraggeber" },
                  { id: "stakeholder", label: "Gutachter" },
                  { id: "program", label: "Programm" },
                  { id: "zeitraum", label: "Zeitraum" },
                  { id: "notes", label: "Notizen" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSettingsFocus(item.id as SettingsFocus)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      settingsFocus === item.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "border-slate-200/70 text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {settingsFocus === "all" ? (
                <>
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
                </>
              ) : null}
              {isSettingsSectionVisible("client") ? (
                <>
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
                </>
              ) : null}
            </div>

            {isSettingsSectionVisible("stakeholder") ? (
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
            ) : null}

            {isSettingsSectionVisible("program") ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="text-sm font-semibold text-slate-800">Programm</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
            </div>
            ) : null}

            {isSettingsSectionVisible("zeitraum") ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="text-sm font-semibold text-slate-800">Zeitraum</div>
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
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
                <label className="space-y-1">
                  <span className="text-sm text-gray-600">Startdatum</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border p-2.5"
                    value={settingsForm.start_date ?? ""}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    onFocus={(e) => openNativePicker(e.currentTarget)}
                    onClick={(e) => openNativePicker(e.currentTarget)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-gray-600">Enddatum</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border p-2.5"
                    value={settingsForm.end_date ?? ""}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    onFocus={(e) => openNativePicker(e.currentTarget)}
                    onClick={(e) => openNativePicker(e.currentTarget)}
                  />
                </label>
              </div>
            </div>
            ) : null}

            {isSettingsSectionVisible("notes") ? (
            <label className="mt-5 block space-y-1">
              <span className="text-sm text-gray-600">Sonstiges / Anmerkungen</span>
              <textarea
                className="w-full rounded-xl border p-2.5"
                rows={3}
                value={settingsForm.notes ?? ""}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
            ) : null}

            {settingsError && <div className="mt-3 text-xs text-red-600">{settingsError}</div>}

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-4">
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
        </div>
      )}
    </div>
  );
}
