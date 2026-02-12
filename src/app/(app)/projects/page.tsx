"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Folder } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type Project = {
  id: string;
  name: string;
  created_at: string;
  project_number?: string | null;
  client_name?: string | null;
};

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectNumber, setNewProjectNumber] = useState("");
  const [newProjectClient, setNewProjectClient] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const formatProjectLabel = (project: Pick<Project, "name" | "project_number">) => {
    const nr = (project.project_number ?? "").trim();
    const name = (project.name ?? "").trim();
    if (nr && name) return `${nr} - ${name}`;
    return name || nr || "Projekt";
  };

  const projectTone = {
    card: "from-sky-50/75 via-white to-blue-50/55",
    icon: "bg-sky-50 text-sky-700 ring-sky-200",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
  };

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (userErr || !user) {
        setError("Nicht eingeloggt.");
        setLoading(false);
        return;
      }

      // Projekte über Membership holen (sauber, keine Testdaten)
      const { data, error } = await supabase
        .from("project_members")
        .select("project:projects(id,name,created_at,project_number,client_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false, referencedTable: "projects" });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const mapped = (data ?? [])
        .map((row: any) => row.project)
        .filter(Boolean) as Project[];

      setProjects(mapped);
      setLoading(false);
    };

    run();
  }, []);

  const createProject = async () => {
    const name = newProjectName.trim();
    const projectNumber = newProjectNumber.trim();
    const clientName = newProjectClient.trim();
    if (!name) {
      setError("Bitte Projektnamen eingeben.");
      return;
    }
    if (!projectNumber) {
      setError("Bitte Projektnummer eingeben.");
      return;
    }
    if (!clientName) {
      setError("Bitte Auftraggeber eingeben.");
      return;
    }

    setCreatingProject(true);
    setError(null);
    const supabase = createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      setCreatingProject(false);
      setError("Nicht eingeloggt.");
      return;
    }

    const projectId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error: projErr } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        name,
        project_number: projectNumber,
        client_name: clientName,
        owner_id: user.id,
        created_by: user.id,
      });

    if (projErr) {
      setCreatingProject(false);
      setError("Projekt anlegen fehlgeschlagen: " + (projErr?.message ?? "unknown"));
      return;
    }

    const { error: memErr } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: user.id,
      role_in_project: "owner",
    });

    if (memErr) {
      setCreatingProject(false);
      setError("Mitgliedschaft anlegen fehlgeschlagen: " + memErr.message);
      return;
    }

    setProjects((prev) => [{ id: projectId, name, created_at: createdAt, project_number: projectNumber, client_name: clientName }, ...prev]);
    setNewProjectName("");
    setNewProjectNumber("");
    setNewProjectClient("");
    setCreateOpen(false);
    setCreatingProject(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Meine Projekte</h1>
            <p className="mt-1 text-sm text-slate-600">
              Überblick über aktive Baustellen, Berichte und Dateien
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              + Neues Projekt
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-600">Lade…</p>}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed p-6 text-sm text-slate-600">
          Noch keine Projekte vorhanden. Erstelle ein Projekt oder starte direkt
          mit einem Tagesbericht.
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const tone = projectTone;
          return (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className={[
              "group rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-sm transition",
              "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
              tone.card,
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">{formatProjectLabel(p)}</div>
                <div className="mt-1 truncate text-[11px] text-slate-500">
                  {p.id}
                </div>
                {p.client_name && (
                  <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200/70 bg-white/80 px-2 py-0.5 text-[11px] text-slate-600">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    <span className="truncate">Auftraggeber: {p.client_name}</span>
                  </div>
                )}
              </div>
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${tone.icon}`}>
                <Folder className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>Zuletzt aktiv</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.badge}`}>
                Projekt
              </span>
            </div>
          </Link>
        )})}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Neues Projekt</h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projektnummer</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={newProjectNumber}
                  onChange={(e) => setNewProjectNumber(e.target.value)}
                  placeholder="z.B. 202-0"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projektname</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="z.B. Baustelle Freiburg Nord"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">Auftraggeber</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={newProjectClient}
                  onChange={(e) => setNewProjectClient(e.target.value)}
                  placeholder="Name / Firma"
                />
              </label>

              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={creatingProject}
                onClick={createProject}
              >
                {creatingProject ? "Erstelle…" : "Projekt anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
