"use client";

import { useEffect, useState } from "react";

type Props = {
  projectId?: string;
};

export default function SchichtenverzeichnisTemplatePreview({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [gridStep, setGridStep] = useState("50");
  const [markerPage, setMarkerPage] = useState("1");
  const [markerX, setMarkerX] = useState("");
  const [markerY, setMarkerY] = useState("");
  const [markerText, setMarkerText] = useState("");
  const [markerSize, setMarkerSize] = useState("10");
  const [fieldKey, setFieldKey] = useState("");
  const [useTopOrigin, setUseTopOrigin] = useState(false);
  const [refWidth, setRefWidth] = useState("");
  const [refHeight, setRefHeight] = useState("");
  const [fields, setFields] = useState<
    Array<{ key: string; page: number; x: number; y: number; size?: number }>
  >([]);
  const [pageSizes, setPageSizes] = useState<
    Array<{ file: string; width: number; height: number; rotation: number }>
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sv_mapping_fields");
      if (raw) setFields(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pdf/schichtenverzeichnis/meta");
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.pages)) setPageSizes(json.pages);
      } catch {
        // ignore
      }
    })();
  }, []);

  const openPdf = async (withGrid: boolean) => {
    const previewWindow = window.open("", "_blank");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (withGrid) {
        params.set("debug", "1");
        if (gridStep) params.set("grid", gridStep);
      }
      const url = `/api/pdf/schichtenverzeichnis${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (previewWindow) previewWindow.close();
        alert("PDF-API Fehler");
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        window.open(objectUrl, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      if (previewWindow) previewWindow.close();
      console.error("Template preview failed", e);
      alert("PDF-Vorschau fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const resolveCoords = () => {
    const pageIndex = Math.max(0, Math.min(1, Number(markerPage) - 1));
    const size = pageSizes[pageIndex];

    const rawX = Number(markerX);
    const rawY = Number(markerY);

    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return { error: "Bitte X/Y setzen." } as const;
    }

    let x = rawX;
    let y = rawY;

    const rw = Number(refWidth);
    const rh = Number(refHeight);

    if (size && Number.isFinite(rw) && rw > 0 && Number.isFinite(rh) && rh > 0) {
      x = (x * size.width) / rw;
      y = (y * size.height) / rh;
    }

    if (size && useTopOrigin) {
      y = size.height - y;
    }

    return { x, y, size, pageIndex } as const;
  };

  const openMarkerPdf = async () => {
    if (!markerX || !markerY) {
      alert("Bitte X/Y setzen.");
      return;
    }

    const resolved = resolveCoords();
    if ("error" in resolved) {
      alert(resolved.error);
      return;
    }

    const { x, y } = resolved;

    const previewWindow = window.open("", "_blank");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", markerPage || "1");
      params.set("x", String(Math.round(x)));
      params.set("y", String(Math.round(y)));
      const label = markerText || fieldKey;
      if (label) params.set("text", label);
      if (markerSize) params.set("size", markerSize);
      if (gridStep) params.set("grid", gridStep);
      params.set("debug", "1");

      const url = `/api/pdf/schichtenverzeichnis?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (previewWindow) previewWindow.close();
        alert("PDF-API Fehler");
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        window.open(objectUrl, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      if (previewWindow) previewWindow.close();
      console.error("Template marker preview failed", e);
      alert("PDF-Vorschau fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const addField = () => {
    const key = fieldKey.trim();
    const page = Number(markerPage);
    const size = Number(markerSize);

    if (!key) {
      alert("Bitte Feld-Key eingeben.");
      return;
    }
    const resolved = resolveCoords();
    if ("error" in resolved) {
      alert(resolved.error);
      return;
    }
    const { x, y } = resolved;

    const next = [
      ...fields,
      {
        key,
        page,
        x,
        y,
        size: Number.isFinite(size) ? size : undefined,
      },
    ];

    setFields(next);
    setFieldKey("");
    try {
      localStorage.setItem("sv_mapping_fields", JSON.stringify(next, null, 2));
    } catch {
      // ignore
    }
  };

  const clearFields = () => {
    setFields([]);
    try {
      localStorage.removeItem("sv_mapping_fields");
    } catch {
      // ignore
    }
  };

  const copyFields = async () => {
    const json = JSON.stringify(fields, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert("JSON kopiert ✅");
    } catch {
      alert("Kopieren fehlgeschlagen.");
    }
  };

  const downloadFields = () => {
    const json = JSON.stringify(fields, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schichtenverzeichnis-mapping.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Schichtenverzeichnis</h1>
        <p className="mt-1 text-sm text-slate-600">
          Template-Vorschau der zwei Seiten. Als Nächstes mappen wir die Felder.
        </p>
        {projectId ? (
          <div className="mt-2 text-xs text-slate-500">Projekt: {projectId}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => openPdf(false)}
          disabled={loading}
        >
          Template öffnen
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => openPdf(true)}
          disabled={loading}
        >
          Template mit Raster
        </button>
      </div>

      <div className="rounded-xl border border-dashed p-4 text-sm text-slate-600">
        Tipp: Das Raster hilft beim exakten Positionieren der Felder (Koordinaten-System: Ursprung links unten).
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Koordinaten-Test</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-500">Feld-Key (JSON)</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="z.B. auftrag_nr"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Raster Schrittweite</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={gridStep}
              onChange={(e) => setGridStep(e.target.value)}
              placeholder="z.B. 25"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Seite</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={markerPage}
              onChange={(e) => setMarkerPage(e.target.value)}
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Referenz‑Breite (optional)</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={refWidth}
              onChange={(e) => setRefWidth(e.target.value)}
              placeholder="z.B. 595"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Referenz‑Höhe (optional)</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={refHeight}
              onChange={(e) => setRefHeight(e.target.value)}
              placeholder="z.B. 842"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">X</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={markerX}
              onChange={(e) => setMarkerX(e.target.value)}
              placeholder="z.B. 120"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Y</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={markerY}
              onChange={(e) => setMarkerY(e.target.value)}
              placeholder="z.B. 740"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Text</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={markerText}
              onChange={(e) => setMarkerText(e.target.value)}
              placeholder="z.B. Auftrag-Nr"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Textgröße</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={markerSize}
              onChange={(e) => setMarkerSize(e.target.value)}
              placeholder="z.B. 10"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 md:col-span-2">
            <input
              type="checkbox"
              checked={useTopOrigin}
              onChange={(e) => setUseTopOrigin(e.target.checked)}
            />
            Y‑Achse von oben (hilft bei Messung im PDF)
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={openMarkerPdf}
          disabled={loading}
        >
          Marker öffnen
        </button>
        <button
            type="button"
            className="ml-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={addField}
            disabled={loading}
          >
            Feld speichern
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">JSON Mapping</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={copyFields}
              disabled={!fields.length}
            >
              JSON kopieren
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={downloadFields}
              disabled={!fields.length}
            >
              JSON herunterladen
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={clearFields}
              disabled={!fields.length}
            >
              Liste leeren
            </button>
          </div>
        </div>
        {pageSizes.length ? (
          <div className="mt-2 text-xs text-slate-500">
            Seite 1: {Math.round(pageSizes[0]?.width ?? 0)} ×{" "}
            {Math.round(pageSizes[0]?.height ?? 0)} | Seite 2:{" "}
            {Math.round(pageSizes[1]?.width ?? 0)} ×{" "}
            {Math.round(pageSizes[1]?.height ?? 0)}
          </div>
        ) : null}
        <textarea
          className="mt-3 h-48 w-full rounded-lg border p-3 text-xs"
          readOnly
          value={JSON.stringify(fields, null, 2)}
        />
      </div>
    </div>
  );
}
