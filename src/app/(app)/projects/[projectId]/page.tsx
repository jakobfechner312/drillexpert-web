"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectHomePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Projekt</h1>
        <p className="mt-1 text-sm text-base-muted">
          Projekt-ID: <span className="font-medium text-base-ink">{projectId}</span>
        </p>
      </div>

      {/* Kacheln */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          title="Entwürfe"
          desc="Zwischengespeicherte Berichte (nach Typ sortiert)."
          href={`/projects/${projectId}/drafts`}
          badge="Drafts"
        />
        <Card
          title="Berichte"
          desc="Abgeschlossene / erzeugte Berichte."
          href={`/projects/${projectId}/reports`}
          badge="Reports"
        />
        <Card
          title="Neuer Tagesbericht"
          desc="Erstelle einen neuen Tagesbericht im Projekt."
          href={`/reports/new?projectId=${projectId}`}
          badge="Neu"
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-base-border bg-white p-5 shadow-soft">
        <div className="text-sm font-semibold">Quick Actions</div>
        <div className="mt-1 text-sm text-base-muted">
          Nächster Schritt: “Neuer Bericht” soll später direkt ein Auswahlmenü bieten
          (Tagesbericht / Schichtbericht / …) und automatisch ins Projekt speichern.
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  desc,
  href,
  badge,
}: {
  title: string;
  desc: string;
  href: string;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-base-border bg-white p-5 shadow-soft hover:bg-base-bg transition"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">{title}</div>
        <span className="rounded-full border border-base-border bg-white px-2 py-1 text-xs text-base-muted">
          {badge}
        </span>
      </div>
      <div className="mt-2 text-sm text-base-muted">{desc}</div>

      <div className="mt-4 text-sm font-medium text-drill-600 group-hover:underline">
        Öffnen →
      </div>
    </Link>
  );
}