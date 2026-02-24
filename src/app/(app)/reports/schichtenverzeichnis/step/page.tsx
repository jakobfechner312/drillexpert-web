"use client";

import { Suspense } from "react";
import SchichtenverzeichnisForm from "../SchichtenverzeichnisForm";

export default function SchichtenverzeichnisStepPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Lade…</div>}>
      <SchichtenverzeichnisForm mode="create" stepper />
    </Suspense>
  );
}
