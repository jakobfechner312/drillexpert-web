"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";
import { isRheinMainLinkProject } from "@/lib/reportAccess";

export default function EditProjectRheinMainLinkReportPage() {
  const params = useParams<{ projectId: string; reportId: string }>();
  const projectId = params?.projectId;
  const reportId = params?.reportId;

  if (!projectId || !reportId) {
    return <div className="p-6">Fehlende Parameter…</div>;
  }
  if (!isRheinMainLinkProject(projectId)) {
    return <div className="p-6">Rhein-Main-Link-Berichte sind nur im freigegebenen Projekt bearbeitbar.</div>;
  }

  return (
    <TagesberichtForm
      mode="edit"
      projectId={projectId}
      reportId={reportId}
      stepper
      reportType="tagesbericht_rhein_main_link"
      formTitle="Tagesbericht Rhein-Main-Link"
      pdfEndpointBase="/api/pdf/tagesbericht-rhein-main-link"
      draftStorageKey="tagesbericht_rhein_main_link_draft"
      draftBlockStorageKey="tagesbericht_rhein_main_link_draft_block"
    />
  );
}
