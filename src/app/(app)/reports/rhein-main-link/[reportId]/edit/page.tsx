"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";
import { RHEIN_MAIN_LINK_PROJECT_ID } from "@/lib/reportAccess";

export default function EditRheinMainLinkReportPage() {
  const params = useParams<{ reportId: string }>();

  return (
    <TagesberichtForm
      projectId={RHEIN_MAIN_LINK_PROJECT_ID}
      reportId={params.reportId}
      mode="edit"
      stepper
      reportType="tagesbericht_rhein_main_link"
      formTitle="Tagesbericht Rhein-Main-Link"
      pdfEndpointBase="/api/pdf/tagesbericht-rhein-main-link"
      draftStorageKey="tagesbericht_rhein_main_link_draft"
      draftBlockStorageKey="tagesbericht_rhein_main_link_draft_block"
    />
  );
}
