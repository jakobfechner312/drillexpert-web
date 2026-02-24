"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import SchichtenverzeichnisForm from "@/app/(app)/reports/schichtenverzeichnis/SchichtenverzeichnisForm";

export default function SchichtenverzeichnisStepInProjectPage() {
  const params = useParams<{ projectId: string }>();
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Lade…</div>}>
      <SchichtenverzeichnisForm projectId={params.projectId} mode="create" stepper />
    </Suspense>
  );
}
