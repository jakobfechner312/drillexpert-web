"use client";

import { useParams } from "next/navigation";
import SchichtenverzeichnisTemplatePreview from "@/app/(app)/reports/schichtenverzeichnis/SchichtenverzeichnisTemplatePreview";

export default function SchichtenverzeichnisNewInProjectPage() {
  const params = useParams<{ projectId: string }>();
  return <SchichtenverzeichnisTemplatePreview projectId={params.projectId} />;
}
