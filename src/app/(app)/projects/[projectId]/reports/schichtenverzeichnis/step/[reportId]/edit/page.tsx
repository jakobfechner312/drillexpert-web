"use client";

import { useParams } from "next/navigation";
import SchichtenverzeichnisForm from "@/app/(app)/reports/schichtenverzeichnis/SchichtenverzeichnisForm";

export default function EditProjectSchichtenverzeichnisStepPage() {
  const params = useParams<{ projectId: string; reportId: string }>();
  return (
    <SchichtenverzeichnisForm
      projectId={params.projectId}
      reportId={params.reportId}
      mode="edit"
      stepper
    />
  );
}
