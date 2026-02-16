"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";
import { isRheinMainLinkProject } from "@/lib/reportAccess";

export default function NewProjectTagesberichtPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;

  if (!projectId) return null; // oder Loader
  if (isRheinMainLinkProject(projectId)) {
    return (
      <main className="space-y-4 p-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <h1 className="text-xl font-semibold">Standard-Tagesbericht deaktiviert</h1>
          <p className="mt-1 text-sm">
            In diesem Projekt ist nur der Berichtstyp TB Rhein-Main-Link erlaubt.
          </p>
          <Link
            href={`/projects/${projectId}/reports/rhein-main-link/new`}
            className="btn btn-secondary mt-3"
          >
            Zum TB Rhein-Main-Link
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Tagesbericht – Neu</h1>
      <p className="mt-2 text-gray-600">Projekt: {projectId}</p>

      <TagesberichtForm projectId={projectId} stepper />
    </main>
  );
}
