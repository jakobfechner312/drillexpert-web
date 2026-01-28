import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Projekte</h1>
        <p className="mt-2 text-gray-600">Bitte einloggen.</p>
      </div>
    );
  }

  // ✅ nur Projekte, in denen du Mitglied bist
  const { data, error } = await supabase
    .from("project_members")
    .select("projects(id,name,created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false, foreignTable: "projects" });

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold">Projekte</h1>
        <p className="mt-2 text-red-600">Fehler: {error.message}</p>
      </div>
    );
  }

  const projects =
    (data ?? [])
      .map((row: any) => row.projects)
      .filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projekte</h1>

        <Link
          href="/reports/new"
          className="rounded-2xl bg-black px-4 py-2 text-white"
        >
          Neuer Tagesbericht
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {projects.length === 0 ? (
          <div className="rounded-2xl border p-4 text-gray-600">
            Noch keine Projekte vorhanden. (Lege eins beim Speichern im Bericht an.)
          </div>
        ) : (
          projects.map((p: any) => (
            <div key={p.id} className="rounded-2xl border p-4">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.id}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}