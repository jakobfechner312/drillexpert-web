"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function EditReportPage() {
  const params = useParams();

  const projectId = params.projectId as string | undefined;
  const reportId = params.reportId as string | undefined;

  if (!projectId || !reportId) {
    return <div className="p-6">Fehlende Parameter…</div>;
  }

  return (
    <TagesberichtForm
      mode="edit"
      projectId={projectId}
      reportId={reportId}
    />
  );
}