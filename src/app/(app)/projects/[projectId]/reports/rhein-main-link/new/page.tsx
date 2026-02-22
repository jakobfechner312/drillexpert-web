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
    <main className="p-6">
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
