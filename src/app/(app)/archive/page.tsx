"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Archive, FileArchive, FolderArchive, MoreHorizontal, Sparkles } from "lucide-react";

type ArchivedProject = {
  id: string;
  name: string;
  project_number?: string | null;
  client_name?: string | null;
  status?: string | null;
  owner_id?: string | null;
};

type ArchivedReport = {
  id: string;
  title: string;
  created_at: string;
  report_type?: string | null;
  project_id?: string | null;
  status?: string | null;
};

type ProjectMemberRow = {
  project: { id?: string | null; name?: string | null } | null;
};

export default function ArchivePage() {
  const supabase = useMemo(() => createClient(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ArchivedProject[]>([]);
  const [reports, setReports] = useState<ArchivedReport[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      setErr("Nicht eingeloggt.");
      setLoading(false);
      return;
    }
    setCurrentUserId(user.id);

    const { data: members, error: membersErr } = await supabase
      .from("project_members")
      .select("project:projects(id,name)")
      .eq("user_id", user.id);
    if (membersErr) {
      setErr("Projektzuordnung laden fehlgeschlagen: " + membersErr.message);
      setLoading(false);
      return;
    }

    const memberProjects = ((members ?? []) as ProjectMemberRow[])
      .flatMap((row) => {
        if (!row.project?.id) return [];
        return [
          {
            id: String(row.project.id),
            name: String(row.project.name ?? ""),
          },
        ];
      });
    const projectIdList = memberProjects.map((project) => project.id);
    setProjectNames(
      Object.fromEntries(memberProjects.map((project) => [project.id, project.name]))
    );

    let archivedProjects: ArchivedProject[] = [];
    if (projectIdList.length > 0) {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,project_number,client_name,status,owner_id")
        .in("id", projectIdList)
        .eq("status", "archived")
        .order("created_at", { ascending: false });
      if (error) {
        setErr("Archivierte Projekte laden fehlgeschlagen: " + error.message);
        setLoading(false);
        return;
      }
      archivedProjects = (data ?? []) as ArchivedProject[];
    }

    const ownArchivedReportsReq = supabase
      .from("reports")
      .select("id,title,created_at,report_type,project_id,status")
      .eq("user_id", user.id)
      .eq("status", "archived")
      .order("created_at", { ascending: false });

    const ownReportsRes = await ownArchivedReportsReq;

    if (ownReportsRes.error) {
      setErr(ownReportsRes.error.message || "Archivierte Berichte laden fehlgeschlagen.");
      setLoading(false);
      return;
    }

    const reportMap = new Map<string, ArchivedReport>();
    (ownReportsRes.data ?? []).forEach((report) => {
      reportMap.set(report.id, report);
    });

    setProjects(archivedProjects);
    setReports(
      Array.from(reportMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-kebab-menu]")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const unarchiveProject = async (projectId: string) => {
    const project = projects.find((row) => row.id === projectId);
    if (!project) return;
    if (!currentUserId || project.owner_id !== currentUserId) {
      setErr("Nur der Projekt-Owner kann dieses Projekt wiederherstellen.");
      return;
    }

    const { error } = await supabase
      .from("projects")
      .update({ status: "laufend" })
      .eq("id", projectId);
    if (error) {
      setErr("Projekt wiederherstellen fehlgeschlagen: " + error.message);
      return;
    }
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
  };

  const unarchiveReport = async (reportId: string) => {
    const { error } = await supabase
      .from("reports")
      .update({ status: "final" })
      .eq("id", reportId);
    if (error) {
      setErr("Bericht wiederherstellen fehlgeschlagen: " + error.message);
      return;
    }
    setReports((prev) => prev.filter((report) => report.id !== reportId));
  };

  const reportTypeLabel = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") return "Schichtenverzeichnis";
    if (type === "tagesbericht_rhein_main_link") return "TB Rhein-Main-Link";
    return "Tagesbericht";
  };
  const reportTypeBadgeClass = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") return "bg-amber-50 text-amber-800 ring-amber-200";
    if (type === "tagesbericht_rhein_main_link") return "bg-indigo-50 text-indigo-800 ring-indigo-200";
    return "bg-sky-50 text-sky-800 ring-sky-200";
  };

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 lg:px-8 space-y-6">
      <section className="rounded-3xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50 via-white to-blue-50 px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 ring-1 ring-cyan-200/80">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Archiv
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Archivbereich</h1>
            <p className="mt-1 text-sm text-slate-600">
              Hier findest du archivierte Projekte und Berichte.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              <FolderArchive className="h-3.5 w-3.5 text-cyan-700" aria-hidden="true" />
              {projects.length} Projekte
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              <FileArchive className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
              {reports.length} Berichte
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Lade…</div>
      ) : null}
      {err ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}

      {!loading ? (
        <>
          <section className="rounded-2xl border border-cyan-200/70 bg-gradient-to-b from-cyan-50/50 to-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                <FolderArchive className="h-5 w-5 text-cyan-700" aria-hidden="true" />
                Archivierte Projekte
              </h2>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{projects.length} Einträge</span>
            </div>
            {projects.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Keine archivierten Projekte.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => {
                  const projectMenuId = `project-${project.id}`;
                  return (
                  <div key={project.id} className={[
                    "relative rounded-2xl border border-cyan-200/60 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                    openMenuId === projectMenuId ? "z-20" : "z-0",
                  ].join(" ")}>
                    <div className="font-medium text-slate-900">
                      {project.project_number ? `${project.project_number} - ${project.name}` : project.name}
                    </div>
                    {project.client_name ? (
                      <div className="mt-1 text-xs text-slate-500">Auftraggeber: {project.client_name}</div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {currentUserId && project.owner_id !== currentUserId ? (
                        <span className="text-xs text-slate-500">Nur Owner kann wiederherstellen</span>
                      ) : <span />}
                      <div className="relative" data-kebab-menu>
                        {(() => {
                          const isOpen = openMenuId === projectMenuId;
                          const canRestore = currentUserId && project.owner_id === currentUserId;
                          return (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50"
                                onClick={() => setOpenMenuId(isOpen ? null : projectMenuId)}
                                aria-label="Aktionen"
                                aria-expanded={isOpen}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                              {isOpen ? (
                                <div className="absolute right-0 top-full z-[80] mt-2 w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-lg">
                                  <Link href={`/projects/${project.id}`} className="flex rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuId(null)}>
                                    Öffnen
                                  </Link>
                                  {canRestore ? (
                                    <button type="button" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-cyan-700 hover:bg-cyan-50" onClick={() => { setOpenMenuId(null); unarchiveProject(project.id); }}>
                                      Wiederherstellen
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-blue-200/70 bg-gradient-to-b from-blue-50/50 to-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Archive className="h-5 w-5 text-blue-700" aria-hidden="true" />
                Archivierte Berichte
              </h2>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{reports.length} Einträge</span>
            </div>
            {reports.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Keine archivierten Berichte.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => {
                  const archivedReportMenuId = `archived-report-${report.id}`;
                  return (
                  <div key={report.id} className={[
                    "relative rounded-2xl border border-blue-200/60 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                    openMenuId === archivedReportMenuId ? "z-20" : "z-0",
                  ].join(" ")}>
                    <div className="font-medium text-slate-900 break-words">{report.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(report.created_at).toLocaleString()}
                    </div>
                    <div className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${reportTypeBadgeClass(report.report_type)}`}>
                      {reportTypeLabel(report.report_type)}
                    </div>
                    {report.project_id ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Projekt: {projectNames[report.project_id] ?? report.project_id}
                      </div>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <div className="relative" data-kebab-menu>
                        {(() => {
                          const isOpen = openMenuId === archivedReportMenuId;
                          const openHref =
                            report.report_type === "schichtenverzeichnis"
                              ? `/api/pdf/schichtenverzeichnis/${report.id}`
                              : report.report_type === "tagesbericht_rhein_main_link"
                                ? `/api/pdf/tagesbericht-rhein-main-link/${report.id}`
                                : `/api/pdf/tagesbericht/${report.id}`;
                          return (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50"
                                onClick={() => setOpenMenuId(isOpen ? null : archivedReportMenuId)}
                                aria-label="Aktionen"
                                aria-expanded={isOpen}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                              {isOpen ? (
                                <div className="absolute right-0 top-full z-[80] mt-2 w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-lg">
                                  <Link href={openHref} target="_blank" className="flex rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpenMenuId(null)}>
                                    Öffnen
                                  </Link>
                                  <button type="button" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50" onClick={() => { setOpenMenuId(null); unarchiveReport(report.id); }}>
                                    Wiederherstellen
                                  </button>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
