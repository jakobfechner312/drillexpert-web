"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";
import { isRheinMainLinkProject } from "@/lib/reportAccess";

export default function NewProjectRheinMainLinkReportPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;

  if (!projectId) return null;
  if (!isRheinMainLinkProject(projectId)) {
    return (
      <main className="space-y-4 p-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <h1 className="text-xl font-semibold">Rhein-Main-Link ist projektgebunden</h1>
          <p className="mt-1 text-sm">Dieser Berichtstyp kann nur im freigegebenen Rhein-Main-Link-Projekt erstellt werden.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-5 p-6">
      <section className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Projektgebunden</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tagesbericht Rhein-Main-Link – Neu</h1>
        <p className="mt-1 text-sm text-slate-600">Projekt: {projectId}</p>
      </section>

      <TagesberichtForm
        projectId={projectId}
        stepper
        reportType="tagesbericht_rhein_main_link"
        formTitle="Tagesbericht Rhein-Main-Link"
        pdfEndpointBase="/api/pdf/tagesbericht-rhein-main-link"
        draftStorageKey="tagesbericht_rhein_main_link_draft"
        draftBlockStorageKey="tagesbericht_rhein_main_link_draft_block"
      />
    </main>
  );
}
