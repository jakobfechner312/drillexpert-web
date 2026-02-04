"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function NewProjectTagesberichtPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;

  if (!projectId) return null; // oder Loader

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Tagesbericht – Neu</h1>
      <p className="mt-2 text-gray-600">Projekt: {projectId}</p>

      <TagesberichtForm projectId={projectId} stepper />
    </main>
  );
}
