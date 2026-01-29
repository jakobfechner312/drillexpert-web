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
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projekte</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
            onClick={() => setCreateOpen(true)}
          >
            + Neues Projekt
          </button>
          <Link
            href="/reports/new"
            className="rounded-xl border px-3 py-2 hover:bg-gray-50"
          >
            + Tagesbericht erstellen
          </Link>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-600">Lade…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <div className="mt-6 rounded-2xl border p-4">
          <p className="text-sm text-gray-600">
            Noch keine Projekte vorhanden. Erstelle einen Bericht und lege dabei
            ein Projekt an.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="rounded-2xl border p-4 hover:bg-gray-50"
          >
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 text-xs text-gray-500">{p.id}</div>
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
