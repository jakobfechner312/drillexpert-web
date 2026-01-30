"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type Project = {
  id: string;
  name: string;
  created_at: string;
};

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

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
        .select("project:projects(id,name,created_at)")
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
    if (!name) {
      setError("Bitte Projektnamen eingeben.");
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

    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .insert({
        name,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id,name,created_at")
      .single();

    if (projErr || !proj) {
      setCreatingProject(false);
      setError("Projekt anlegen fehlgeschlagen: " + (projErr?.message ?? "unknown"));
      return;
    }

    const { error: memErr } = await supabase.from("project_members").insert({
      project_id: proj.id,
      user_id: user.id,
      role_in_project: "owner",
    });

    if (memErr) {
      setCreatingProject(false);
      setError("Mitgliedschaft anlegen fehlgeschlagen: " + memErr.message);
      return;
    }

    setProjects((prev) => [proj, ...prev]);
    setNewProjectName("");
    setCreateOpen(false);
    setCreatingProject(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Workspace</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Meine Projekte</h1>
            <p className="mt-1 text-sm text-slate-600">
              Überblick über aktive Baustellen, Berichte und Dateien
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setCreateOpen(true)}
            >
              + Neues Projekt
            </button>
            <Link
              href="/reports/new"
              className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              + Tagesbericht erstellen
            </Link>
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
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="group rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">{p.name}</div>
                <div className="mt-1 text-xs text-slate-500">{p.id}</div>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M4 7a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>Zuletzt aktiv</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                Projekt
              </span>
            </div>
          </Link>
        ))}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Neues Projekt</h3>
              <button
                type="button"
                className="rounded-xl border px-3 py-2"
                onClick={() => setCreateOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projektname</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="z.B. Baustelle Freiburg Nord"
                />
              </label>

              <button
                type="button"
                className="w-full rounded-xl border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
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
