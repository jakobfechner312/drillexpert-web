"use client";

import { useParams } from "next/navigation";

export default function ProjectDraftsPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Entwürfe</h1>
      <p className="mt-2 text-base-muted">
        Projekt: <span className="font-medium">{params.projectId}</span>
      </p>

      <div className="mt-6 rounded-2xl border border-base-border bg-white p-5 shadow-soft">
        <div className="text-sm text-base-muted">
          Nächster Schritt: Liste aller Entwürfe nach Berichtstyp (Ordner).
        </div>
      </div>
    </div>
  );
}