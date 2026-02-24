"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Download, FileSpreadsheet, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type KlarspuelHeaderFormState = {
  bv: string;
  bohrungNr: string;
  blatt: string;
  auftragsNr: string;
  datum: string;
  ausgefuehrtVon: string;
  pumpeneinlaufBeiM: string;
  ablaufleitungM: string;
};

type KlarspuelMessRow = {
  id: string;
  messstelle: string;
  hoeheROK: string;
  uhrzeit: string;
  abstichmassAbGok: string;
  iPerSec: string;
  lf: string;
  ph: string;
  tempC: string;
  bemerkungen: string;
};

type KlarspuelExcelExportPayload = KlarspuelHeaderFormState & {
  grundwasserRows: KlarspuelMessRow[];
  wiederanstiegRows: KlarspuelMessRow[];
};

type KlarspuelScheduleRule = {
  id: string;
  fromMin: string;
  toMin: string;
  stepMin: string;
};

type KlarspuelScheduleConfig = {
  maxDurationMin: string;
  extraTimesMin: string;
  rules: KlarspuelScheduleRule[];
};

const EXCEL_BETA_USERS_CLIENT = new Set(
  (process.env.NEXT_PUBLIC_EXCEL_BETA_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

const canUseExcelBetaClient = (email: string | null | undefined) => {
  const normalized = String(email ?? "").trim().toLowerCase();
  return Boolean(normalized) && EXCEL_BETA_USERS_CLIENT.has(normalized);
};

export default function ExcelPage() {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<{ email: string | null } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [klarspuelHeaderForm, setKlarspuelHeaderForm] = useState<KlarspuelHeaderFormState>({
    bv: "",
    bohrungNr: "",
    blatt: "1",
    auftragsNr: "",
    datum: new Date().toLocaleDateString("de-DE"),
    ausgefuehrtVon: "",
    pumpeneinlaufBeiM: "",
    ablaufleitungM: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<KlarspuelHeaderFormState | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [grundwasserRows, setGrundwasserRows] = useState<KlarspuelMessRow[]>(() =>
    createRowsFromSchedule("grundwasser-row", createDefaultScheduleConfig("grundwasser"), "")
  );
  const [wiederanstiegRows, setWiederanstiegRows] = useState<KlarspuelMessRow[]>(() =>
    createRowsFromSchedule("wiederanstieg-row", createDefaultScheduleConfig("wiederanstieg"), "")
  );
  const [grundwasserIPerSec, setGrundwasserIPerSec] = useState("");
  const [wiederanstiegIPerSec, setWiederanstiegIPerSec] = useState("");
  const [grundwasserSchedule, setGrundwasserSchedule] = useState<KlarspuelScheduleConfig>(
    createDefaultScheduleConfig("grundwasser")
  );
  const [wiederanstiegSchedule, setWiederanstiegSchedule] = useState<KlarspuelScheduleConfig>(
    createDefaultScheduleConfig("wiederanstieg")
  );
  const [showGrundwasserTaktEditor, setShowGrundwasserTaktEditor] = useState(false);
  const [showWiederanstiegTaktEditor, setShowWiederanstiegTaktEditor] = useState(false);
  const [wiederanstiegStartAutoSyncEnabled, setWiederanstiegStartAutoSyncEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setMe({ email: data.user?.email ?? null });
      setAuthLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!wiederanstiegStartAutoSyncEnabled) return;
    const lastGrundwasserAbstichmass = getLastFilledAbstichmass(grundwasserRows);
    if (!lastGrundwasserAbstichmass) return;

    setWiederanstiegRows((prev) => {
      if (!prev.length) return prev;
      const firstRow = prev[0];
      if (String(firstRow.abstichmassAbGok ?? "").trim() === lastGrundwasserAbstichmass) return prev;
      const next = [...prev];
      next[0] = { ...firstRow, abstichmassAbGok: lastGrundwasserAbstichmass };
      return next;
    });
  }, [grundwasserRows, wiederanstiegStartAutoSyncEnabled]);

  const canUseBeta = canUseExcelBetaClient(me?.email);

  const updateWiederanstiegRow = (
    id: string,
    key: keyof Omit<KlarspuelMessRow, "id">,
    value: string
  ) => {
    if (key === "abstichmassAbGok" && id === wiederanstiegRows[0]?.id) {
      setWiederanstiegStartAutoSyncEnabled(false);
    }
    updateMessRow(setWiederanstiegRows, id, key, value);
  };

  const fillTestData = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = String(today.getFullYear());
    setKlarspuelHeaderForm({
      bv: "BV Testbaustelle Nord",
      bohrungNr: "B-12",
      blatt: "1",
      auftragsNr: `KS-${yyyy}-001`,
      datum: `${dd}.${mm}.${yyyy}`,
      ausgefuehrtVon: "Jakob (Test)",
      pumpeneinlaufBeiM: "12,50",
      ablaufleitungM: "8,20",
    });
    setError(null);
    setOk(null);
    setPreviewData(null);
    setStep(1);
  };

  const fillTestGrundwasserData = () => {
    setGrundwasserIPerSec("1,2");
    setGrundwasserRows((prev) => {
      const base = createRowsFromSchedule("grundwasser-row", grundwasserSchedule, "1,2");
      if (base[0]) {
        base[0] = { ...base[0], abstichmassAbGok: "4,10", bemerkungen: "klar" };
      }
      if (base[1]) {
        base[1] = { ...base[1], abstichmassAbGok: "4,05" };
      }
      return base.length ? base : prev;
    });
  };

  const fillTestWiederanstiegData = () => {
    setWiederanstiegIPerSec("");
    setWiederanstiegRows((prev) => {
      const base = createRowsFromSchedule("wiederanstieg-row", wiederanstiegSchedule, "");
      if (base[0]) {
        base[0] = { ...base[0], abstichmassAbGok: "4,30", bemerkungen: "Wiederanstieg gestartet" };
      }
      if (base[1]) {
        base[1] = { ...base[1], abstichmassAbGok: "4,18" };
      }
      return base.length ? base : prev;
    });
  };

  const generateRowsFromSchedule = (
    setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>,
    prefix: "grundwasser-row" | "wiederanstieg-row",
    config: KlarspuelScheduleConfig,
    iPerSecValue: string
  ) => {
    const durations = buildScheduleDurations(config);
    if (!durations.length) {
      setError("Keine gültigen Zeiten erzeugt. Bitte Takt/Enddauer prüfen.");
      setOk(null);
      return;
    }

    setter(
      createRowsFromSchedule(prefix, config, iPerSecValue, durations)
    );

    setError(null);
    setOk(`${durations.length} Messzeiten erzeugt.`);
  };

  const updatePreview = () => {
    setPreviewData({ ...klarspuelHeaderForm });
    setError(null);
    setOk(null);
  };

  const runKlarspuelExcel = async (openInBrowser = false) => {
    setError(null);
    setOk(null);

    const grundwasserIPerSecText = String(grundwasserIPerSec ?? "").trim();
    if (!grundwasserIPerSecText) {
      setError("Bitte im Block Grundwasser den Wert 'l / sec.' eintragen, bevor du Excel erstellst.");
      return;
    }

    setLoading(true);
    try {
      const payload: KlarspuelExcelExportPayload = {
        ...klarspuelHeaderForm,
        grundwasserRows,
        wiederanstiegRows,
      };

      const res = await fetch("/api/excel/klarspuel/header", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Fehler (${res.status})`);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] || "KlarSpuel-Header.xlsx";

      const url = window.URL.createObjectURL(blob);
      if (openInBrowser) {
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 15_000);
        setOk("Excel-Datei erzeugt (Browser-Ansicht versucht; je nach Browser wird sie heruntergeladen).");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setOk("Excel-Datei erzeugt und heruntergeladen.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel konnte nicht erzeugt werden.");
    } finally {
      setLoading(false);
    }
  };

  const updateMessRow = (
    setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>,
    id: string,
    key: keyof Omit<KlarspuelMessRow, "id">,
    value: string
  ) => {
    setter((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  const addMessRow = (
    setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>,
    prefix: "grundwasser-row" | "wiederanstieg-row",
    iPerSecValue: string,
    scheduleConfig: KlarspuelScheduleConfig
  ) => {
    setter((prev) => {
      const row = createEmptyMessRow(`${prefix}-${Date.now()}`);
      row.uhrzeit = getNextScheduleTimeForAppend(prev, scheduleConfig);
      row.iPerSec = iPerSecValue;
      return [...prev, row];
    });
  };

  const clearAllMessValues = (setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>) => {
    setter((prev) =>
      prev.map((row) => ({
        ...row,
        abstichmassAbGok: "",
        bemerkungen: "",
      }))
    );
  };

  const clearAllWiederanstiegMessValues = () => {
    setWiederanstiegStartAutoSyncEnabled(true);
    setWiederanstiegRows((prev) => {
      const cleared = prev.map((row) => ({
        ...row,
        abstichmassAbGok: "",
        bemerkungen: "",
      }));
      const lastGrundwasserAbstichmass = getLastFilledAbstichmass(grundwasserRows);
      if (cleared.length && lastGrundwasserAbstichmass) {
        cleared[0] = { ...cleared[0], abstichmassAbGok: lastGrundwasserAbstichmass };
      }
      return cleared;
    });
  };

  const applyUniformIPerSec = (
    setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>,
    value: string
  ) => {
    setter((prev) => prev.map((row) => ({ ...row, iPerSec: value })));
  };

  const insertNextRowFromDelta = (
    setter: Dispatch<SetStateAction<KlarspuelMessRow[]>>,
    prefix: "grundwasser-row" | "wiederanstieg-row",
    scheduleConfig: KlarspuelScheduleConfig,
    iPerSecValue: string,
    rowId: string,
    deltaCm: number
  ): void => {
    setter((prev) => {
      const index = prev.findIndex((row) => row.id === rowId);
      if (index < 0) return prev;

      const sourceRow = prev[index];
      const parsedMass = parseAbstichmassMeters(sourceRow.abstichmassAbGok);
      const next = [...prev];

      // Bevorzugt die bereits vorhandene nächste Zeile befüllen (fixe Standardzeilen).
      const existingNextRow = next[index + 1];
      if (existingNextRow) {
        const nextRow = { ...existingNextRow };
        nextRow.iPerSec = iPerSecValue;
        if (!nextRow.uhrzeit) {
          nextRow.uhrzeit = getNextScheduleTimeAfterRow(prev, index, scheduleConfig);
        }
        if (parsedMass != null) {
          nextRow.abstichmassAbGok = formatAbstichmassMeters(parsedMass + deltaCm / 100);
        }
        next[index + 1] = nextRow;
        return next;
      }
      return next;
    });
  };

  const updateScheduleField = (
    setter: Dispatch<SetStateAction<KlarspuelScheduleConfig>>,
    key: keyof Omit<KlarspuelScheduleConfig, "rules">,
    value: string
  ) => {
    setter((prev) => ({ ...prev, [key]: value }));
  };

  const updateScheduleRule = (
    setter: Dispatch<SetStateAction<KlarspuelScheduleConfig>>,
    id: string,
    key: keyof Omit<KlarspuelScheduleRule, "id">,
    value: string
  ) => {
    setter((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === id ? { ...rule, [key]: value } : rule)),
    }));
  };

  const addScheduleRule = (setter: Dispatch<SetStateAction<KlarspuelScheduleConfig>>) => {
    setter((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        createScheduleRule(`rule-${Date.now()}`, "", "", ""),
      ],
    }));
  };

  const removeScheduleRule = (setter: Dispatch<SetStateAction<KlarspuelScheduleConfig>>, id: string) => {
    setter((prev) => ({
      ...prev,
      rules: prev.rules.length <= 1 ? prev.rules : prev.rules.filter((rule) => rule.id !== id),
    }));
  };

  if (authLoading) {
    return <div className="text-sm text-slate-500">Lade…</div>;
  }

  if (!canUseBeta) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
        <div className="text-base font-semibold text-slate-800">Excel-Formulare</div>
        <div className="mt-2 text-sm text-slate-500">Dieser Bereich ist aktuell noch nicht freigeschaltet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-sky-50/60 px-5 py-3">
          <div>
            <h1 className="text-base font-semibold text-sky-900">Excel-Formulare (Beta)</h1>
            <p className="mt-1 text-xs text-slate-500">
              Eigener Bereich für Excel-Vorlagen und spätere Excel-Reports.
            </p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
            Nur für freigegebene Nutzer
          </span>
        </div>

        <div className="p-5">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={[
                "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                step === 1
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => setStep(1)}
            >
              1. Stammdaten
            </button>
            <button
              type="button"
              className={[
                "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                step === 2
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => setStep(2)}
            >
              2. Messdaten Grundwasser
            </button>
            <button
              type="button"
              className={[
                "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                step === 3
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => setStep(3)}
            >
              3. Messdaten Wiederanstieg
            </button>
          </div>

          <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-emerald-200">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">Klarspül-Protokoll (Header-MVP)</div>
            </div>
          </div>

          {step === 1 ? (
            <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "bv", label: "BV", placeholder: "Bauvorhaben" },
              { key: "bohrungNr", label: "Bohrung Nr.", placeholder: "z. B. B-12" },
              { key: "blatt", label: "Blatt", placeholder: "1" },
              { key: "auftragsNr", label: "Auftr.Nr.", placeholder: "KS-2026-001" },
              { key: "datum", label: "Datum", placeholder: "23.02.2026" },
              { key: "ausgefuehrtVon", label: "Ausgeführt von", placeholder: "Name" },
              { key: "pumpeneinlaufBeiM", label: "Pumpeneinlauf bei (m)", placeholder: "12,50" },
              { key: "ablaufleitungM", label: "Ablaufleitung (m)", placeholder: "8,20" },
            ].map((field) => (
              <label key={field.key} className="space-y-1">
                <span className="text-xs font-medium text-slate-600">{field.label}</span>
                <input
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-300"
                  value={klarspuelHeaderForm[field.key as keyof KlarspuelHeaderFormState]}
                  onChange={(e) =>
                    setKlarspuelHeaderForm((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={fillTestData}
              disabled={loading}
            >
              Testdaten füllen
            </button>
          </div>

          {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
          {ok ? <div className="mt-2 text-xs text-emerald-700">{ok}</div> : null}

          <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Browser-Vorschau (Header)</div>
              <div className="text-xs text-slate-500">
                {previewData ? "Nur Vorschau, noch kein Excel-Export" : "Noch keine Vorschau erzeugt"}
              </div>
            </div>

            {previewData ? (
              <div className="rounded-xl border-2 border-slate-300 bg-white p-4 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <div className="text-2xl font-bold tracking-tight text-slate-900">Klarspül-Protokoll</div>
                    <div className="mt-6">
                      <div className="text-xs uppercase tracking-wide text-slate-500">BV</div>
                      <div className="mt-1 min-h-8 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
                        {previewData.bv || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                      <div className="font-semibold text-slate-700">Bohrung Nr.</div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1">{previewData.bohrungNr || "—"}</div>
                      <div className="font-semibold text-slate-700">Blatt</div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1">{previewData.blatt || "—"}</div>
                      <div className="font-semibold text-slate-700">Auftr.Nr.</div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1">{previewData.auftragsNr || "—"}</div>
                      <div className="font-semibold text-slate-700">Datum</div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1">{previewData.datum || "—"}</div>
                      <div className="font-semibold text-slate-700">Ausgeführt von</div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1">{previewData.ausgefuehrtVon || "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-xs text-slate-500">Pumpeneinlauf bei</div>
                    <div className="mt-1 text-sm font-medium text-slate-800">
                      {previewData.pumpeneinlaufBeiM ? `${previewData.pumpeneinlaufBeiM} m` : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-xs text-slate-500">Ablaufleitung</div>
                    <div className="mt-1 text-sm font-medium text-slate-800">
                      {previewData.ablaufleitungM ? `${previewData.ablaufleitungM} m` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                Fülle Felder aus. Die Vorschau erscheint nach Testdaten oder beim späteren Speichern/Export.
              </div>
            )}
          </div>
            </>
          ) : step === 2 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowGrundwasserTaktEditor((prev) => !prev)}
                  aria-label="Einstellungen"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Einstellungen
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
                  onClick={() => void runKlarspuelExcel(false)}
                  disabled={loading}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {loading ? "Erzeuge Excel…" : "Excel erstellen"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 space-y-4">
                <div className="grid gap-2 sm:max-w-xs">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">l / sec. (für alle Zeilen)</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
                      value={grundwasserIPerSec}
                      onChange={(e) => {
                        const value = e.target.value;
                        setGrundwasserIPerSec(value);
                        applyUniformIPerSec(setGrundwasserRows, value);
                      }}
                      placeholder="optional"
                    />
                  </label>
                </div>

                {showGrundwasserTaktEditor ? (
                  <ScheduleEditor
                    config={grundwasserSchedule}
                    onClose={() => setShowGrundwasserTaktEditor(false)}
                    onResetDefault={() => setGrundwasserSchedule(createDefaultScheduleConfig("grundwasser"))}
                    onApply={() =>
                      generateRowsFromSchedule(
                        setGrundwasserRows,
                        "grundwasser-row",
                        grundwasserSchedule,
                        grundwasserIPerSec
                      )
                    }
                    onUpdateField={(key, value) => updateScheduleField(setGrundwasserSchedule, key, value)}
                    onUpdateRule={(id, key, value) => updateScheduleRule(setGrundwasserSchedule, id, key, value)}
                    onAddRule={() => addScheduleRule(setGrundwasserSchedule)}
                    onRemoveRule={(id) => removeScheduleRule(setGrundwasserSchedule, id)}
                  />
                ) : null}

                <MessRowsEditor
                rows={grundwasserRows}
                titlePrefix="Grundwasser-Zeile"
                onChangeRow={(id, key, value) => updateMessRow(setGrundwasserRows, id, key, value)}
                onClearAllValues={() => clearAllMessValues(setGrundwasserRows)}
                onAddNextRow={(rowId, deltaCm) =>
                  insertNextRowFromDelta(
                      setGrundwasserRows,
                      "grundwasser-row",
                      grundwasserSchedule,
                      grundwasserIPerSec,
                      rowId,
                      deltaCm
                    )
                  }
                />

                <MessRowsPreview title="Vorschau Grundwasser" rows={grundwasserRows} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowWiederanstiegTaktEditor((prev) => !prev)}
                  aria-label="Einstellungen"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Einstellungen
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
                  onClick={() => void runKlarspuelExcel(false)}
                  disabled={loading}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {loading ? "Erzeuge Excel…" : "Excel erstellen"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 space-y-4">
                <div className="grid gap-2 sm:max-w-xs">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">l / sec. (für alle Zeilen)</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
                      value={wiederanstiegIPerSec}
                      onChange={(e) => {
                        const value = e.target.value;
                        setWiederanstiegIPerSec(value);
                        applyUniformIPerSec(setWiederanstiegRows, value);
                      }}
                      placeholder="optional"
                    />
                  </label>
                </div>

                {showWiederanstiegTaktEditor ? (
                  <ScheduleEditor
                    config={wiederanstiegSchedule}
                    onClose={() => setShowWiederanstiegTaktEditor(false)}
                    onResetDefault={() => setWiederanstiegSchedule(createDefaultScheduleConfig("wiederanstieg"))}
                    onApply={() =>
                      generateRowsFromSchedule(
                        setWiederanstiegRows,
                        "wiederanstieg-row",
                        wiederanstiegSchedule,
                        wiederanstiegIPerSec
                      )
                    }
                    onUpdateField={(key, value) => updateScheduleField(setWiederanstiegSchedule, key, value)}
                    onUpdateRule={(id, key, value) => updateScheduleRule(setWiederanstiegSchedule, id, key, value)}
                    onAddRule={() => addScheduleRule(setWiederanstiegSchedule)}
                    onRemoveRule={(id) => removeScheduleRule(setWiederanstiegSchedule, id)}
                  />
                ) : null}

                <MessRowsEditor
                  rows={wiederanstiegRows}
                  titlePrefix="Wiederanstieg-Zeile"
                  onChangeRow={updateWiederanstiegRow}
                  onClearAllValues={clearAllWiederanstiegMessValues}
                  onAddNextRow={(rowId, deltaCm) =>
                    insertNextRowFromDelta(
                      setWiederanstiegRows,
                      "wiederanstieg-row",
                      wiederanstiegSchedule,
                      wiederanstiegIPerSec,
                      rowId,
                      deltaCm
                    )
                  }
                />

                <MessRowsPreview title="Vorschau Wiederanstieg" rows={wiederanstiegRows} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function createScheduleRule(id: string, fromMin: string, toMin: string, stepMin: string): KlarspuelScheduleRule {
  return { id, fromMin, toMin, stepMin };
}

function createDefaultScheduleConfig(phase: "grundwasser" | "wiederanstieg"): KlarspuelScheduleConfig {
  if (phase === "wiederanstieg") {
    return {
      maxDurationMin: "15",
      extraTimesMin: "",
      rules: [
        createScheduleRule("rule-wa-1", "0", "5", "1"),
        createScheduleRule("rule-wa-2", "5", "15", "5"),
      ],
    };
  }

  return {
    maxDurationMin: "120",
    extraTimesMin: "",
    rules: [
      createScheduleRule("rule-gw-1", "0", "10", "1"),
      createScheduleRule("rule-gw-2", "10", "20", "2"),
      createScheduleRule("rule-gw-3", "20", "30", "5"),
      createScheduleRule("rule-gw-4", "30", "60", "10"),
      createScheduleRule("rule-gw-5", "60", "120", "15"),
    ],
  };
}

function buildScheduleDurations(config: KlarspuelScheduleConfig): number[] {
  const maxDuration = parsePositiveInt(config.maxDurationMin);
  if (!maxDuration) return [];

  const allMinutes = new Set<number>();

  for (const rule of config.rules) {
    const fromMin = parseNonNegativeInt(rule.fromMin);
    const toMin = parseNonNegativeInt(rule.toMin);
    const stepMin = parsePositiveInt(rule.stepMin);
    if (fromMin == null || toMin == null || !stepMin) continue;
    if (toMin <= fromMin) continue;

    let current = fromMin + stepMin;
    while (current <= toMin && current <= maxDuration) {
      if (current > 0) allMinutes.add(current);
      current += stepMin;
    }
  }

  for (const extra of parseExtraTimes(config.extraTimesMin)) {
    if (extra > 0 && extra <= maxDuration) {
      allMinutes.add(extra);
    }
  }

  return Array.from(allMinutes).sort((a, b) => a - b);
}

function createRowsFromSchedule(
  prefix: "grundwasser-row" | "wiederanstieg-row",
  config: KlarspuelScheduleConfig,
  iPerSecValue: string,
  prebuiltDurations?: number[]
): KlarspuelMessRow[] {
  const durations = prebuiltDurations ?? buildScheduleDurations(config);
  return durations.map((minute, index) => {
    const row = createEmptyMessRow(`${prefix}-${index + 1}`);
    row.uhrzeit = formatDurationMinute(minute);
    row.iPerSec = iPerSecValue;
    return row;
  });
}

function parseExtraTimes(value: string): number[] {
  return value
    .split(/[,\s;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n));
}

function parseNonNegativeInt(value: string): number | null {
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parsePositiveInt(value: string): number | null {
  const n = parseNonNegativeInt(value);
  if (n == null || n <= 0) return null;
  return n;
}

function formatDurationMinute(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:00`;
}

function parseDurationMinuteFromText(value: string): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => part.trim());
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || minutes < 0) return null;
  return Math.floor(hours) * 60 + Math.floor(minutes);
}

function getNextScheduleMinute(currentMinute: number | null, scheduleConfig: KlarspuelScheduleConfig): number | null {
  const durations = buildScheduleDurations(scheduleConfig);
  if (!durations.length) return null;
  if (currentMinute == null) return durations[0] ?? null;
  const next = durations.find((minute) => minute > currentMinute);
  return next ?? null;
}

function getNextScheduleTimeForAppend(rows: KlarspuelMessRow[], scheduleConfig: KlarspuelScheduleConfig): string {
  const sortedMinutes = rows
    .map((row) => parseDurationMinuteFromText(row.uhrzeit))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const lastMinute = sortedMinutes.length ? sortedMinutes[sortedMinutes.length - 1] : null;
  const nextMinute = getNextScheduleMinute(lastMinute, scheduleConfig);
  return nextMinute == null ? "" : formatDurationMinute(nextMinute);
}

function getNextScheduleTimeAfterRow(
  rows: KlarspuelMessRow[],
  rowIndex: number,
  scheduleConfig: KlarspuelScheduleConfig
): string {
  const currentMinute = parseDurationMinuteFromText(rows[rowIndex]?.uhrzeit ?? "");
  const usedMinutes = new Set(
    rows
      .map((row) => parseDurationMinuteFromText(row.uhrzeit))
      .filter((v): v is number => v != null)
  );
  const durations = buildScheduleDurations(scheduleConfig);
  const nextMinute =
    durations.find((minute) => {
      if (currentMinute != null && minute <= currentMinute) return false;
      return !usedMinutes.has(minute);
    }) ?? getNextScheduleMinute(currentMinute, scheduleConfig);
  return nextMinute == null ? "" : formatDurationMinute(nextMinute);
}

function parseAbstichmassMeters(value: string): number | null {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatAbstichmassMeters(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function getLastFilledAbstichmass(rows: KlarspuelMessRow[]): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = String(rows[i]?.abstichmassAbGok ?? "").trim();
    if (value) return value;
  }
  return "";
}

function createEmptyMessRow(id: string): KlarspuelMessRow {
  return {
    id,
    messstelle: "",
    hoeheROK: "",
    uhrzeit: "",
    abstichmassAbGok: "",
    iPerSec: "",
    lf: "",
    ph: "",
    tempC: "",
    bemerkungen: "",
  };
}

function ScheduleEditor({
  config,
  onClose,
  onResetDefault,
  onApply,
  onUpdateField,
  onUpdateRule,
  onAddRule,
  onRemoveRule,
}: {
  config: KlarspuelScheduleConfig;
  onClose: () => void;
  onResetDefault: () => void;
  onApply: () => void;
  onUpdateField: (key: keyof Omit<KlarspuelScheduleConfig, "rules">, value: string) => void;
  onUpdateRule: (id: string, key: keyof Omit<KlarspuelScheduleRule, "id">, value: string) => void;
  onAddRule: () => void;
  onRemoveRule: (id: string) => void;
}) {
  const previewDurations = buildScheduleDurations(config).slice(0, 12);
  const previewSuffix = buildScheduleDurations(config).length > 12 ? " …" : "";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">Einstellungen</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            onClick={onApply}
          >
            Takt anwenden
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
        Zeiten:{" "}
        {previewDurations.length
          ? `${previewDurations.map((m) => formatDurationMinute(m)).join(", ")}${previewSuffix}`
          : "Keine gültigen Zeiten"}
      </div>

      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Enddauer (Minuten)</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
              value={config.maxDurationMin}
              onChange={(e) => onUpdateField("maxDurationMin", e.target.value)}
              placeholder="120"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Sonderzeiten (Minuten)</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
              value={config.extraTimesMin}
              onChange={(e) => onUpdateField("extraTimesMin", e.target.value)}
              placeholder="75,90,120"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intervallregeln</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={onResetDefault}
              >
                Standard
              </button>
              <button
                type="button"
                className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                onClick={onAddRule}
              >
                Regel +
              </button>
            </div>
          </div>

          {config.rules.map((rule, index) => (
            <div key={rule.id} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
              <div className="self-center text-xs font-medium text-slate-500">#{index + 1}</div>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-600">von</span>
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-300"
                  value={rule.fromMin}
                  onChange={(e) => onUpdateRule(rule.id, "fromMin", e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-600">bis</span>
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-300"
                  value={rule.toMin}
                  onChange={(e) => onUpdateRule(rule.id, "toMin", e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-600">Schritt</span>
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-300"
                  value={rule.stepMin}
                  onChange={(e) => onUpdateRule(rule.id, "stepMin", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="self-end rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                onClick={() => onRemoveRule(rule.id)}
                disabled={config.rules.length <= 1}
              >
                X
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessRowsEditor({
  rows,
  titlePrefix,
  onChangeRow,
  onClearAllValues,
  onAddNextRow,
}: {
  rows: KlarspuelMessRow[];
  titlePrefix: string;
  onChangeRow: (id: string, key: keyof Omit<KlarspuelMessRow, "id">, value: string) => void;
  onClearAllValues: () => void;
  onAddNextRow: (rowId: string, deltaCm: number) => void;
}) {
  const deltaButtons = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const [activeRowId, setActiveRowId] = useState<string | null>(rows[0]?.id ?? null);

  useEffect(() => {
    if (!rows.length) {
      setActiveRowId(null);
      return;
    }
    if (!activeRowId || !rows.some((row) => row.id === activeRowId)) {
      setActiveRowId(rows[0].id);
    }
  }, [rows, activeRowId]);

  const activeIndex = rows.findIndex((row) => row.id === activeRowId);
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeRow = rows[safeActiveIndex];
  if (!activeRow) return null;
  const firstRow = rows[0];
  const firstAbstichMissing = !String(firstRow?.abstichmassAbGok ?? "").trim();
  const activeAbstichMissing = !String(activeRow.abstichmassAbGok ?? "").trim();

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200/70 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">
            {titlePrefix} {safeActiveIndex + 1} / {rows.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              onClick={() => setActiveRowId(rows[Math.max(0, safeActiveIndex - 1)]?.id ?? activeRow?.id ?? null)}
              disabled={safeActiveIndex <= 0}
            >
              ←
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              onClick={() =>
                setActiveRowId(rows[Math.min(rows.length - 1, safeActiveIndex + 1)]?.id ?? activeRow?.id ?? null)
              }
              disabled={safeActiveIndex >= rows.length - 1}
            >
              →
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              onClick={() => {
                const confirmed = window.confirm(
                  "Alle Messwerte in diesem Block löschen? (Stammdaten bleiben erhalten)"
                );
                if (!confirmed) return;
                onClearAllValues();
                setActiveRowId(rows[0]?.id ?? activeRow.id);
              }}
            >
              Werte löschen
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["uhrzeit", "Dauer", "0:01:00"],
            ["abstichmassAbGok", "Abstichmaß ab GOK *", "4,10"],
          ].map(([key, label, placeholder]) => (
            <label key={key} className="space-y-1">
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
                value={activeRow[key as keyof Omit<KlarspuelMessRow, "id" | "bemerkungen">] as string}
                onChange={(e) =>
                  onChangeRow(activeRow.id, key as keyof Omit<KlarspuelMessRow, "id">, e.target.value)
                }
                placeholder={placeholder}
              />
            </label>
          ))}
          <label className="space-y-1 lg:col-span-2">
            <span className="text-xs font-medium text-slate-600">Bemerkungen</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-sky-300"
              value={activeRow.bemerkungen}
              onChange={(e) => onChangeRow(activeRow.id, "bemerkungen", e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>

        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
          <div className="text-xs font-medium text-slate-600">Nächste Zeile (Delta in cm)</div>
          {firstAbstichMissing ? (
            <div className="text-xs text-rose-600">
              Erstes Abstichmaß (Messung 1) ist Pflicht, bevor du weiterklickst.
            </div>
          ) : activeAbstichMissing ? (
            <div className="text-xs text-amber-700">
              Aktuelles Abstichmaß eingeben, dann mit +/-/0 die nächste Messung übernehmen.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {deltaButtons.map((deltaCm) => (
              <button
                key={`${activeRow.id}-delta-${deltaCm}`}
                type="button"
                className={[
                  "rounded-md px-2 py-1 text-xs font-semibold transition",
                  deltaCm < 0
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : deltaCm > 0
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => {
                  onAddNextRow(activeRow.id, deltaCm);
                  const nextRowId = rows[safeActiveIndex + 1]?.id;
                  if (nextRowId) setActiveRowId(nextRowId);
                }}
                disabled={firstAbstichMissing || activeAbstichMissing || safeActiveIndex >= rows.length - 1}
              >
                {deltaCm > 0 ? `+${deltaCm}` : String(deltaCm)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessRowsPreview({
  title,
  rows,
}: {
  title: string;
  rows: KlarspuelMessRow[];
}) {
  const filledRows = rows.filter((row) => {
    return Boolean(
      String(row.abstichmassAbGok ?? "").trim() ||
        String(row.bemerkungen ?? "").trim() ||
        String(row.iPerSec ?? "").trim()
    );
  });

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">
          {filledRows.length} / {rows.length} befüllt
        </div>
      </div>

      {filledRows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Dauer</th>
                <th className="px-2 py-2 font-medium">Abstichmaß</th>
                <th className="px-2 py-2 font-medium">Bemerkung</th>
              </tr>
            </thead>
            <tbody>
              {filledRows.map((row, index) => {
                const originalIndex = rows.findIndex((r) => r.id === row.id);
                return (
                  <tr key={row.id} className={index % 2 ? "bg-slate-50/50" : ""}>
                    <td className="px-2 py-2 text-slate-500">{originalIndex + 1}</td>
                    <td className="px-2 py-2 font-medium text-slate-800">{row.uhrzeit || "—"}</td>
                    <td className="px-2 py-2 text-slate-800">{row.abstichmassAbGok || "—"}</td>
                    <td className="px-2 py-2 text-slate-600">{row.bemerkungen || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/40 px-3 py-4 text-sm text-slate-500">
          Noch keine Messwerte eingetragen.
        </div>
      )}
    </div>
  );
}
