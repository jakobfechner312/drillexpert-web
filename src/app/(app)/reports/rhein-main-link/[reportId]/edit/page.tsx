"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function EditRheinMainLinkReportPage() {
  const params = useParams<{ reportId: string }>();

  return (
    <TagesberichtForm
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
