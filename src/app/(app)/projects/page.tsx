"use client";

import Link from "next/link";

export default function ProjectsPage() {
  // 🔧 Platzhalter – kommt später aus DB
  const projects = [
    { id: "TEST123", name: "Baustelle Freiburg Nord" },
    { id: "TEST456", name: "Bohrung Offenburg Süd" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Projekte</h1>
        <p className="mt-1 text-sm text-base-muted">
          Lege Projekte an und verwalte darin Berichte & Entwürfe.
        </p>
      </div>

      {/* Projektliste */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="rounded-2xl border border-base-border bg-white p-5 shadow-soft hover:bg-base-bg transition"
          >
            <div className="text-lg font-semibold">{p.name}</div>
            <div className="mt-1 text-sm text-base-muted">
              Projekt-ID: {p.id}
            </div>
            <div className="mt-4 text-sm font-medium text-drill-600">
              Öffnen →
            </div>
          </Link>
        ))}

        {/* Neues Projekt */}
        <button
          disabled
          className="rounded-2xl border border-dashed border-base-border bg-white p-5 text-left text-base-muted opacity-60 cursor-not-allowed"
        >
          <div className="text-lg font-semibold">+ Neues Projekt</div>
          <div className="mt-1 text-sm">
            Projekt-Erstellung kommt gleich.
          </div>
        </button>
      </div>
    </div>
  );
}