"use client";

import { useParams } from "next/navigation";
import SchichtenverzeichnisForm from "@/app/(app)/reports/schichtenverzeichnis/SchichtenverzeichnisForm";

export default function SchichtenverzeichnisStepInProjectPage() {
  const params = useParams<{ projectId: string }>();
  return <SchichtenverzeichnisForm projectId={params.projectId} mode="create" stepper />;
}
