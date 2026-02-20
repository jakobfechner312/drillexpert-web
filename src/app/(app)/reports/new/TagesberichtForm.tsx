"use client";

import { createClient } from "@/lib/supabase/browser";
import { useDraftActions } from "@/components/DraftActions";
import { useMemo, useRef, useEffect, useState, useCallback, type SetStateAction } from "react";
import SignatureCanvas from "react-signature-canvas";
import { usePathname, useSearchParams } from "next/navigation";
import { Clock3 } from "lucide-react";

import type {
  Tagesbericht,
  TableRow,
  VerrohrtFlag,
  ProbenFlag,
  UmsetzenRow,
  WorkerRow,
  PegelAusbauRow,
  TimeRange,
  TransportRow,
} from "@/types/tagesbericht";
import { createDefaultTagesbericht } from "@/lib/defaultTagesbericht";
import { RHEIN_MAIN_LINK_PROJECT_ID } from "@/lib/reportAccess";

/** ---------- Helpers: empty rows (strict zu deinen Types) ---------- */

function emptyTableRow(): TableRow {
  return {
    boNr: "",
    gebohrtVon: "",
    gebohrtBis: "",
    verrohrtVon: "",
    verrohrtBis: "",
    verrohrtFlags: [],

    vollbohrVon: "",
    vollbohrBis: "",

    hindernisVon: "",
    hindernisBis: "",
    hindernisZeit: "",

    schachtenVon: "",
    schachtenBis: "",
    schachtenZeit: "",

    probenFlags: [],
    probenValues: {},
    indivProbe: "",
    spt: "",

    verfuellung: {
      tonVon: "",
      tonBis: "",
      bohrgutVon: "",
      bohrgutBis: "",
      zementBentVon: "",
      zementBentBis: "",
      betonVon: "",
      betonBis: "",
    },
  };
}

function emptyWorker(): WorkerRow {
  return {
    name: "",
    reineArbeitsStd: "",
    wochenendfahrt: "",
    ausfallStd: "",
    ausloeseT: false,
    ausloeseN: false,
    arbeitsakteNr: "",
    stunden: Array(16).fill(""),
    workCycles: [""],
  };
}

function emptyUmsetzenRow(): UmsetzenRow {
  return { von: "", auf: "", entfernungM: "", zeit: "", begruendung: "", wartezeit: "" };
}

function emptyTransportRow() {
  return { from: "", to: "", km: null, time: "" };
}

const emptyTimeRow = () => ({ name: "", from: "", to: "" });
const DEVICE_OPTIONS = [
  "Atego Tyroller",
  "MAN Tyroller",
  "AXOR Tyroller",
  "MAN Willi",
  "Wirth ECO 1",
  "Tyroller Klappraupe",
  "Raupe Fraste XL",
  "Zetros",
  "MAN weiß",
  "Unimog",
  "Sennebogen 630 blau",
  "Sennbogen 624 grün",
  "Fraste alt",
] as const;
const RML_GERAETE_OPTIONS = ["LKW", "Radlader/Dumper", "Wasserwagen", "Kompressor"] as const;
const RML_BOHRHELFER_OPTIONS = [
  "Jens Gerth",
  "Michel Otto",
  "Fabian Fiedler",
  "Paul Sasu",
  "Serhii Vakhterov",
  "Daniel Ziebold",
  "Daniel Reglin",
  "Maxi Flegler",
] as const;
const RML_KRONE_OPTIONS = ["146", "178", "220", "273", "324", "368", "419", "509", "700", "800", "1.180", "1.500"] as const;
const RML_VERFUELLUNG_OPTIONS = ["Tonformling", "Sand", "Kies", "Zement-Bentonit", "ortsuebliches Material", "Beton", "Individuell"] as const;
const RML_BOHRVERFAHREN_OPTIONS = [
  "Rammkernbohrung",
  "Rotationsbohrung",
  "Vollbohrung",
] as const;
const RML_AUFSCHLUSS_KRONE_146_TO_509 = ["146", "178", "220", "273", "324", "368", "419", "509"] as const;
const RML_AUFSCHLUSS_KRONE_178_TO_509 = ["178", "220", "273", "324", "368", "419", "509"] as const;
const PEGEL_DM_OPTIONS = ['2"', '3"', '4"', '5"', '6"'] as const;
const BG_CHECK_OPTIONS = [
  "Betriebsflüssigkeiten",
  "Schmierung",
  "Bolzen, Lager",
  "Seile und Tragmittel",
  "Hydraulik",
  "ev. Leckagen",
] as const;
const BG_CHECK_DELIMITER = " | ";
const DEV_RML_TEST_SAVE_USER_ID = (process.env.NEXT_PUBLIC_RML_TEST_SAVE_USER_ID ?? "").trim();
const DEV_RML_TEST_SAVE_USER_EMAIL = (process.env.NEXT_PUBLIC_RML_TEST_SAVE_USER_EMAIL ?? "jfechner1994@gmail.com")
  .trim()
  .toLowerCase();
const SPT_MAX_SCHLAEGE = 50;
const SPT_DEFAULT_SEGMENT_CM = 15;
const DRILLER_DEVICE_HISTORY_KEY = "tagesbericht_driller_device_history_v1";
const RML_BOHRHELFER_HISTORY_BY_USER_KEY = "tagesbericht_rml_bohrhelfer_history_by_user_v1";
const RML_REPORT_COUNTER_BY_USER_KEY = "tagesbericht_rml_report_counter_by_user_v1";

  const normalizeDrillerName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const isKnownDeviceOption = (value: unknown): value is (typeof DEVICE_OPTIONS)[number] =>
  typeof value === "string" && DEVICE_OPTIONS.includes(value as (typeof DEVICE_OPTIONS)[number]);
const isKnownRmlBohrhelferOption = (value: unknown): value is (typeof RML_BOHRHELFER_OPTIONS)[number] =>
  typeof value === "string" && RML_BOHRHELFER_OPTIONS.includes(value as (typeof RML_BOHRHELFER_OPTIONS)[number]);
const parsePositiveInteger = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
};
const getRmlAufschlussKronenOptions = (bohrverfahren: unknown): readonly string[] => {
  const value = String(bohrverfahren ?? "").trim();
  if (value === "Rotationsbohrung") return ["146"];
  if (value === "Rammkernbohrung") return RML_AUFSCHLUSS_KRONE_178_TO_509;
  if (value === "Vollbohrung") return RML_AUFSCHLUSS_KRONE_146_TO_509;
  return RML_AUFSCHLUSS_KRONE_146_TO_509;
};
type PegelRohrArt = "sumpfrohr" | "filter" | "aufsatz_pvc" | "aufsatz_stahl";
const PEGEL_ROHRART_OPTIONS: Array<{ value: PegelRohrArt; label: string }> = [
  { value: "sumpfrohr", label: "Sumpfrohr" },
  { value: "filter", label: "Filter" },
  { value: "aufsatz_pvc", label: "Aufsatz PVC" },
  { value: "aufsatz_stahl", label: "Aufsatz Stahl" },
];
type PegelVerfuellungArt =
  | "ton"
  | "sand"
  | "zement"
  | "bohrgut"
  | "filterkies";
const PEGEL_VERFUELLUNG_OPTIONS: Array<{ value: PegelVerfuellungArt; label: string }> = [
  { value: "ton", label: "Ton" },
  { value: "sand", label: "Sand" },
  { value: "zement", label: "Zement" },
  { value: "bohrgut", label: "Bohrgut" },
  { value: "filterkies", label: "Filterkies" },
];

type GeoSuggestion = {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  postalCode?: string;
};

function emptyPegelAusbauRow(): PegelAusbauRow {
  return {
    bohrNr: "",
    pegelDm: "",
    ausbauArtType: "",
    ausbauArtCustom: "",

    // ROHRE
    sumpfVon: "",
    sumpfBis: "",
    filterVon: "",
    filterBis: "",
    rohrePvcVon: "",
    rohrePvcBis: "",
    aufsatzPvcVon: "",
    aufsatzPvcBis: "",
    aufsatzStahlVon: "",
    aufsatzStahlBis: "",
    filterkiesVon: "",
    filterkiesBis: "",

    // DICHTUNG-VERFÜLLUNG
    tonVon: "",
    tonBis: "",
    sandVon: "",
    sandBis: "",
    zementBentVon: "",
    zementBentBis: "",
    bohrgutVon: "",
    bohrgutBis: "",

    // VERSCHLÜSSE
    sebaKap: false,
    boKap: false,
    hydrKap: false,
    fernGask: false,
    passavant: false,
    betonSockel: false,
    blech: false,
    abstHalter: "",
    klarpump: false,
    filterkiesKoernung: "",
  };
}

type TagesberichtFormProps = {
  projectId?: string;
  reportId?: string;
  mode?: "create" | "edit";
  stepper?: boolean;
  pdfEndpointBase?: string;
  draftStorageKey?: string;
  draftBlockStorageKey?: string;
  reportType?: "tagesbericht" | "tagesbericht_rhein_main_link";
  formTitle?: string;
};

const GroupCard = ({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 bg-sky-50/60 px-4 py-2 border-b border-slate-200/70">
      <h2 className="text-base font-semibold text-sky-900 tracking-wide sm:text-lg">{title}</h2>
      {badge ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {badge}
        </span>
      ) : null}
    </div>
    <div className="min-w-0 overflow-x-hidden p-4">{children}</div>
  </section>
);

const SubGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200/60 bg-white">
    <div className="border-b border-slate-200/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {title}
    </div>
    <div className="min-w-0 p-3">{children}</div>
  </div>
);

const RowActions = ({
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
  countLabel,
  disableAdd,
  disableRemove,
  className,
}: {
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  onRemove: () => void;
  countLabel?: string;
  disableAdd?: boolean;
  disableRemove?: boolean;
  className?: string;
}) => (
  <div className={["flex flex-wrap items-start gap-2 sm:items-center sm:justify-between", className].filter(Boolean).join(" ")}>
    {countLabel ? <span className="text-sm text-slate-500">{countLabel}</span> : null}
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={onAdd}
        disabled={disableAdd}
      >
        {addLabel}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={onRemove}
        disabled={disableRemove}
      >
        {removeLabel}
      </button>
    </div>
  </div>
);

const TimePickerInput = ({
  value,
  onValueChange,
  onOpenPicker,
  className,
  buttonLabel = "Zeit auswählen",
}: {
  value: string;
  onValueChange: (next: string) => void;
  onOpenPicker: (input: HTMLInputElement | null) => void;
  className?: string;
  buttonLabel?: string;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="time"
        step={60}
        className={[className ?? "", "pr-11"].filter(Boolean).join(" ")}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={(e) => onOpenPicker(e.currentTarget)}
        onClick={(e) => onOpenPicker(e.currentTarget)}
      />
      <button
        type="button"
        aria-label={buttonLabel}
        className="absolute inset-y-1.5 right-1.5 inline-flex w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onOpenPicker(inputRef.current)}
      >
        <Clock3 size={16} />
      </button>
    </div>
  );
};

function normalizeTagesbericht(raw: unknown): Tagesbericht {
  const base = createDefaultTagesbericht();

  const r = { ...base, ...(raw ?? {}) } as Tagesbericht;

  // ---------- nested defaults ----------
  const w = r.weather ?? {};
  const toNumberOrNull = (v: unknown) => {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  };
  r.weather = {
    ...w,
    conditions: w.conditions ?? [],
    tempMaxC: toNumberOrNull((w as any).tempMaxC),
    tempMinC: toNumberOrNull((w as any).tempMinC),
  };

  const sig = r.signatures ?? {};
  r.signatures = {
    ...sig,
    clientOrManagerName: sig.clientOrManagerName ?? "",
    drillerName: sig.drillerName ?? "",
    clientOrManagerSigPng: sig.clientOrManagerSigPng ?? "",
    drillerSigPng: sig.drillerSigPng ?? "",
  };

  // ---------- arrays (mindestens 1 Zeile) ----------
  r.tableRows = (Array.isArray(r.tableRows) && r.tableRows.length ? r.tableRows : [emptyTableRow()]).map(
    (row) => ({
      ...emptyTableRow(),
      ...row,
      probenValues: typeof row?.probenValues === "object" && row?.probenValues ? row.probenValues : {},
    })
  );
  r.workers = (Array.isArray(r.workers) && r.workers.length ? r.workers : [emptyWorker()]).map((w) => {
    const cycles = Array.isArray((w as any).workCycles) && (w as any).workCycles.length ? (w as any).workCycles : r.workCycles ?? [""];
    const st = Array.isArray(w.stunden) ? [...w.stunden] : [];
    while (st.length < cycles.length) st.push("");
    return { ...emptyWorker(), ...w, workCycles: cycles, stunden: st.slice(0, cycles.length) };
  });
  r.umsetzenRows = Array.isArray(r.umsetzenRows) && r.umsetzenRows.length ? r.umsetzenRows : [emptyUmsetzenRow()];
  r.pegelAusbauRows = (
    Array.isArray(r.pegelAusbauRows) && r.pegelAusbauRows.length
      ? r.pegelAusbauRows
      : [emptyPegelAusbauRow()]
  ).map((row) => ({
    ...emptyPegelAusbauRow(),
    ...(row ?? {}),
  }));

  // diese Arrays nutzt dein UI (WorkTime/Break/Transport)
  r.workTimeRows = Array.isArray(r.workTimeRows) && r.workTimeRows.length ? r.workTimeRows : [emptyTimeRow()];
  r.breakRows = Array.isArray(r.breakRows) && r.breakRows.length ? r.breakRows : [emptyTimeRow()];
  r.transportRows = Array.isArray(r.transportRows) && r.transportRows.length ? r.transportRows : [emptyTransportRow()];
  r.waterLevelRows =
    Array.isArray(r.waterLevelRows) && r.waterLevelRows.length
      ? r.waterLevelRows.map((row) => ({
          time: typeof row?.time === "string" ? row.time : "",
          meters: typeof row?.meters === "string" ? row.meters : "",
        }))
      : [{ time: "", meters: "" }];
  r.verrohrungRows =
    Array.isArray(r.verrohrungRows) && r.verrohrungRows.length
      ? r.verrohrungRows.map((row) => ({
          diameter: typeof row?.diameter === "string" ? row.diameter : "",
          meters: typeof row?.meters === "string" ? row.meters : "",
        }))
      : [{ diameter: "", meters: "" }];
  r.workCyclesSame = typeof r.workCyclesSame === "boolean" ? r.workCyclesSame : false;

  // ---------- FIX: date & time inputs ----------
  // date input braucht "YYYY-MM-DD"
  if (typeof r.date === "string") {
    if (r.date.includes("T")) r.date = r.date.slice(0, 10);
    // falls es mal als "DD.MM.YYYY" kommt (optional, safe)
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(r.date)) {
      const [dd, mm, yyyy] = r.date.split(".");
      r.date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // time input braucht "HH:MM"
  const toHHMM = (v: unknown): string => {
    if (typeof v !== "string") return "";
    const compact = v.trim().replace(/\s+/g, "");
    // "HH:MM:SS" -> "HH:MM"
    if (/^\d{2}:\d{2}:\d{2}$/.test(compact)) return compact.slice(0, 5);
    // "HH:MM" passt schon
    if (/^\d{2}:\d{2}$/.test(compact)) return compact;
    // tolerant für "H:M", "H.MM", "12 :30"
    const loose = compact.match(/^(\d{1,2})[:.](\d{1,2})$/);
    if (!loose) return "";
    const hh = Number(loose[1]);
    const mm = Number(loose[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  if (Array.isArray(r.workTimeRows)) {
    r.workTimeRows = r.workTimeRows.map((row) => ({
      ...row,
      name: row?.name ?? "",
      from: toHHMM(row?.from ?? ""),
      to: toHHMM(row?.to ?? ""),
    }));
  }

  if (Array.isArray(r.breakRows)) {
    r.breakRows = r.breakRows.map((row) => ({
      ...row,
      name: row?.name ?? "",
      from: toHHMM(row?.from ?? ""),
      to: toHHMM(row?.to ?? ""),
    }));
  }

  if (Array.isArray(r.transportRows)) {
    r.transportRows = r.transportRows.map((row) => ({
      ...row,
      km: (() => {
        const rawKm = (row as { km?: unknown } | undefined)?.km;
        if (typeof rawKm === "number" && Number.isFinite(rawKm)) return rawKm;
        if (typeof rawKm === "string") {
          const parsed = Number(rawKm.trim().replace(",", "."));
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })(),
      time: toHHMM(row?.time ?? ""),
    }));
  }

  return r as Tagesbericht;
}

const DictationButton = ({ onClick, active = false }: { onClick: () => void; active?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
      active
        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`}
    title="Diktierfunktion öffnen"
    aria-label="Diktierfunktion öffnen"
  >
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  </button>
);

export default function TagesberichtForm({
  projectId,
  reportId,
  mode = "create",
  stepper = true,
  pdfEndpointBase = "/api/pdf/tagesbericht",
  draftStorageKey = "tagesbericht_draft",
  draftBlockStorageKey = "tagesbericht_draft_block",
  reportType = "tagesbericht",
  formTitle,
}: TagesberichtFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const draftId = useMemo(() => searchParams.get("draftId") ?? "", [searchParams]);
  const hasDraftId = draftId.length > 0;

  useEffect(() => {
    console.log("[PROPS CHECK]", { mode, reportId, projectId });
  }, [mode, reportId, projectId]);

  const savingRef = useRef(false);
  const dictationTargetsRef = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const dictationRecognitionRef = useRef<{
    stop: () => void;
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onend: (() => void) | null;
  } | null>(null);
  const activeDictationTargetRef = useRef<string | null>(null);
  const dictationShouldRunRef = useRef(false);
  const [activeDictationTarget, setActiveDictationTarget] = useState<string | null>(null);
  const reportSaveKeyRef = useRef<string | null>(null);
  const forceMyReportsSaveOnceRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveReadyRef = useRef(false);
  const localDraftLoadedRef = useRef(false);
  const weatherPrefillProjectRef = useRef<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [rmlNextReportNr, setRmlNextReportNr] = useState<number>(1);
  const isAutoSaveBlocked = () => {
    try {
      return localStorage.getItem(draftBlockStorageKey) === "1";
    } catch {
      return false;
    }
  };

  type SaveScope = "unset" | "project" | "my_reports";
  const isRmlReport = reportType === "tagesbericht_rhein_main_link";
  const enforcedProjectId = isRmlReport ? RHEIN_MAIN_LINK_PROJECT_ID : null;
  const [saveScope, setSaveScope] = useState<SaveScope>(projectId || enforcedProjectId ? "project" : "unset");
  const [initialProjectChoiceDone, setInitialProjectChoiceDone] = useState<boolean>(Boolean(projectId) || Boolean(enforcedProjectId) || mode === "edit");
  const pendingSaveResolveRef = useRef<
  ((v: { scope: SaveScope; projectId: string | null } | undefined) => void) | null
  >(null);  
  
 // nur für den Picker (wenn KEIN projectId prop da ist)
  const [localProjectId, setLocalProjectId] = useState<string | null>(enforcedProjectId);

  // das ist der “echte” Projektwert, den du überall nutzt
  const effectiveProjectId = projectId ?? localProjectId ?? enforcedProjectId;

  

  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);  

  // Modal/UI state bleibt wie gehabt
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; project_number?: string | null }[]>([]);
  const [projectUiLoading, setProjectUiLoading] = useState(false);
  const [prefillProjectId, setPrefillProjectId] = useState<string | null>(projectId ?? enforcedProjectId ?? null);
  const isRmlDevTestUser =
    isRmlReport &&
    ((DEV_RML_TEST_SAVE_USER_ID.length > 0 && currentUserId === DEV_RML_TEST_SAVE_USER_ID) ||
      (DEV_RML_TEST_SAVE_USER_EMAIL.length > 0 && currentUserEmail === DEV_RML_TEST_SAVE_USER_EMAIL));

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setCurrentUserId(String(data?.user?.id ?? ""));
      setCurrentUserEmail(String(data?.user?.email ?? "").trim().toLowerCase());
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (mode !== "create") return;
    if (reportType !== "tagesbericht_rhein_main_link") return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const fullName = String(
        ((data?.user?.user_metadata as { full_name?: unknown } | undefined)?.full_name ?? "")
      ).trim();
      if (!fullName) return;
      setReport((prev) => {
        const currentName = String(prev?.signatures?.drillerName ?? "").trim();
        const currentWorkerName = String(prev?.workers?.[0]?.name ?? "").trim();
        const currentTimeName = String(prev?.workTimeRows?.[0]?.name ?? "").trim();
        if (currentName && currentWorkerName && currentTimeName) return prev;

        const nextWorkers = Array.isArray(prev.workers) && prev.workers.length ? [...prev.workers] : [emptyWorker()];
        if (!String(nextWorkers[0]?.name ?? "").trim()) {
          nextWorkers[0] = { ...nextWorkers[0], name: fullName };
        }
        const nextWorkTimeRows =
          Array.isArray(prev.workTimeRows) && prev.workTimeRows.length ? [...prev.workTimeRows] : [emptyTimeRow()];
        if (!String(nextWorkTimeRows[0]?.name ?? "").trim()) {
          nextWorkTimeRows[0] = { ...nextWorkTimeRows[0], name: fullName };
        }
        return {
          ...prev,
          workers: nextWorkers,
          workTimeRows: nextWorkTimeRows,
          signatures: {
            ...(prev.signatures ?? {}),
            drillerName: currentName || fullName,
          },
        };
      });
    })();
    return () => {
      mounted = false;
    };
  }, [mode, reportType, supabase]);

  useEffect(() => {
    if (!enforcedProjectId) return;
    setSaveScope("project");
    setLocalProjectId(enforcedProjectId);
    setInitialProjectChoiceDone(true);
  }, [enforcedProjectId]);

  const loadMyProjects = useCallback(async () => {
    const supabase = createClient();
    setProjectUiLoading(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user) {
      setProjectUiLoading(false);
      alert("Nicht eingeloggt.");
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id,name,project_number")
      .order("created_at", { ascending: false });

    setProjectUiLoading(false);

    if (error) {
      console.error(error);
      alert("Projekte laden fehlgeschlagen: " + error.message);
      return;
    }

    setProjects((data ?? []) as { id: string; name: string; project_number?: string | null }[]);
  }, []);

  const requireProjectId = useCallback(async (): Promise<string | null> => {
    if (enforcedProjectId) return enforcedProjectId;
    if (effectiveProjectId) return effectiveProjectId;

    await loadMyProjects();
    setProjectModalOpen(true);
    return null;
   }, [effectiveProjectId, enforcedProjectId, loadMyProjects]);

  const ensureSaveTarget = useCallback(async (): Promise<{ scope: SaveScope; projectId: string | null } | null> => {
    if (isRmlReport && forceMyReportsSaveOnceRef.current) {
      forceMyReportsSaveOnceRef.current = false;
      return { scope: "my_reports", projectId: null };
    }

    if (enforcedProjectId) {
      return { scope: "project", projectId: enforcedProjectId };
    }

    // If this form is opened inside a concrete project route, keep that project fixed.
    if (projectId) {
      return { scope: "project", projectId };
    }

    // If user already chose at form start, keep that target.
    if (saveScope === "project" && localProjectId) {
      return { scope: "project", projectId: localProjectId };
    }
    if (saveScope === "my_reports") {
      return { scope: "my_reports", projectId: null };
    }

    // Outside a project route and no initial choice yet: ask once.
    await loadMyProjects();
    setProjectModalOpen(true);

    const result = await new Promise<{ scope: SaveScope; projectId: string | null } | undefined>((resolve) => {
      pendingSaveResolveRef.current = resolve;
    });

    pendingSaveResolveRef.current = null;
    return result ?? null;
  }, [projectId, saveScope, localProjectId, loadMyProjects, enforcedProjectId, isRmlReport]);

  const fetchProjectPrefill = useCallback(async (targetProjectId: string) => {
    const { data: proj, error } = await supabase
      .from("projects")
      .select("name,project_number,client_name")
      .eq("id", targetProjectId)
      .single();

    if (error || !proj) return null;

    const p = proj as {
      name?: string | null;
      project_number?: string | null;
      client_name?: string | null;
    };
    return {
      project: String(p.name ?? "").trim(),
      aNr: String(p.project_number ?? "").trim(),
      client: String(p.client_name ?? "").trim(),
    };
  }, [supabase]);

  const applyProjectPrefill = useCallback(async (targetProjectId: string, force = false) => {
    const prefill = await fetchProjectPrefill(targetProjectId);
    if (!prefill) return;

    setReport((prev) => {
      const next = { ...prev };
      if (force || !String(prev.project ?? "").trim()) next.project = prefill.project;
      if (force || !String(prev.aNr ?? "").trim()) next.aNr = prefill.aNr;
      if (force || !String(prev.client ?? "").trim()) next.client = prefill.client;
      return next;
    });
    setPrefillProjectId(targetProjectId);
  }, [fetchProjectPrefill]);

  const hydrateReportWithProject = useCallback(
    async (source: Tagesbericht, targetProjectId: string | null) => {
      if (!targetProjectId) return source;
      const prefill = await fetchProjectPrefill(targetProjectId);
      if (!prefill) return source;
      return {
        ...source,
        project: prefill.project || source.project,
        aNr: prefill.aNr || source.aNr,
        client: prefill.client || source.client,
      };
    },
    [fetchProjectPrefill]
  );

  const createProject = useCallback(async () => {
    const supabase = createClient();

    const name = newProjectName.trim();
    if (!name) return alert("Bitte Projektnamen eingeben.");

    setCreatingProject(true);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      setCreatingProject(false);
      return alert("Nicht eingeloggt.");
    }

    // 1) projects insert
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .insert({
        name,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id,name,project_number")
      .single();

    if (projErr || !proj) {
      setCreatingProject(false);
      console.error(projErr);
      return alert("Projekt anlegen fehlgeschlagen: " + (projErr?.message ?? "unknown"));
    }

    // 2) membership insert
    const { error: memErr } = await supabase.from("project_members").insert({
      project_id: proj.id,
      user_id: user.id,
      role_in_project: "owner",
    });

    if (memErr) {
      setCreatingProject(false);
      console.error(memErr);
      return alert("Mitgliedschaft anlegen fehlgeschlagen: " + memErr.message);
    }

    // 3) UI updaten + auswählen
    setProjects((prev) => [{ id: proj.id, name: proj.name, project_number: (proj as { project_number?: string | null }).project_number ?? null }, ...prev]);
    setSaveScope("project");
    setLocalProjectId(proj.id);
    setNewProjectName("");
    setProjectModalOpen(false);
    setInitialProjectChoiceDone(true);
    void applyProjectPrefill(proj.id, true);

    pendingSaveResolveRef.current?.({ scope: "project", projectId: proj.id });
    pendingSaveResolveRef.current = null;

    setCreatingProject(false);
  }, [newProjectName, applyProjectPrefill]);

  const [report, setReport] = useState<Tagesbericht>(() => {
    const base = createDefaultTagesbericht();
    const fallback: Tagesbericht = {
      ...base,
      reportType,
      tableRows: Array.isArray(base.tableRows) && base.tableRows.length ? base.tableRows : [emptyTableRow()],
      workers: Array.isArray(base.workers) && base.workers.length ? base.workers : [emptyWorker()],
      umsetzenRows: Array.isArray(base.umsetzenRows) && base.umsetzenRows.length ? base.umsetzenRows : [emptyUmsetzenRow()],
      pegelAusbauRows: Array.isArray(base.pegelAusbauRows) && base.pegelAusbauRows.length ? base.pegelAusbauRows : [emptyPegelAusbauRow()],
    };

    if (mode === "edit" || hasDraftId) return fallback;
    if (typeof window === "undefined") return fallback;

    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      localDraftLoadedRef.current = true;
      return { ...normalizeTagesbericht(parsed), reportType };
    } catch (e) {
      console.warn("Local draft load failed", e);
      return fallback;
    }
  });
  const reportTitleLabel = formTitle ?? (reportType === "tagesbericht_rhein_main_link" ? "Tagesbericht Rhein-Main-Link" : "Tagesbericht");
  const [customCycleDraft, setCustomCycleDraft] = useState<Record<string, string>>({});
  const [customWorkCycles, setCustomWorkCycles] = useState<string[]>([]);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [rmlOrtSuggestions, setRmlOrtSuggestions] = useState<GeoSuggestion[]>([]);
  const [umsetzenSuggestions, setUmsetzenSuggestions] = useState<Record<string, GeoSuggestion[]>>({});
  const [umsetzenCoords, setUmsetzenCoords] = useState<Record<string, { lat: number; lon: number; label: string }>>({});
  const [umsetzenRouteLoading, setUmsetzenRouteLoading] = useState<Record<number, boolean>>({});
  const [transportSuggestions, setTransportSuggestions] = useState<Record<string, GeoSuggestion[]>>({});
  const [transportCoords, setTransportCoords] = useState<Record<string, { lat: number; lon: number; label: string }>>({});
  const [transportRouteLoading, setTransportRouteLoading] = useState<Record<number, boolean>>({});
  const [rmlSptCmOverrides, setRmlSptCmOverrides] = useState<Record<string, string>>({});
  const geoSearchDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const [pegelRohrTypesByRow, setPegelRohrTypesByRow] = useState<Record<number, PegelRohrArt[]>>({});
  const [pegelVerfuellungTypesByRow, setPegelVerfuellungTypesByRow] = useState<Record<number, PegelVerfuellungArt[]>>({});
  const pegelRohrInitCountRef = useRef(0);
  const pegelVerfuellungInitCountRef = useRef(0);
  const [clientSigEnabled, setClientSigEnabled] = useState(false);
  const isRml = reportType === "tagesbericht_rhein_main_link";
  const useStepper = stepper;
  const steps = useMemo(
    () =>
      isRml
        ? [
            { key: "stammdaten", title: "Stammdaten" },
            { key: "bohrdaten", title: "Bohrdaten" },
            { key: "aufschluss", title: "Aufschluss / Krone / Tiefe" },
            { key: "wasser-verrohrung", title: "Wasserspiegel / Verrohrung" },
            { key: "taetigkeiten", title: "Beschreibung der Tätigkeiten" },
            { key: "ausbau", title: "Ausbau" },
            { key: "verfuellung", title: "Verfüllung" },
            { key: "spt", title: "SPT-Versuche" },
            { key: "abschluss", title: "Bemerkungen" },
            { key: "pruefung-signatur", title: "Prüfung & Unterschriften" },
          ]
        : [
            { key: "stammdaten", title: "Stammdaten" },
            { key: "fahrzeuge", title: "Fahrzeuge / Transport / Umsetzen" },
            { key: "wetter", title: "Wetter + Ruhewasser" },
            { key: "zeiten", title: "Arbeitszeit & Pausen" },
            { key: "arbeitsakte", title: "Arbeitsakte / Stunden" },
            { key: "tabelle", title: "Tabelle Bohrungen" },
            { key: "verfuellung", title: "Verfüllung" },
            { key: "pegel", title: "Pegelausbau" },
            { key: "abschluss", title: "Bemerkungen & Unterschriften" },
          ],
    [isRml]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const undoHistoryRef = useRef<Array<{ report: Tagesbericht; stepIndex: number }>>([]);
  const undoLastSnapshotRef = useRef<string>("");
  const undoApplyingRef = useRef(false);
  const [undoCount, setUndoCount] = useState(0);
  const setStepIndexKeepingScroll = useCallback((next: SetStateAction<number>) => {
    if (typeof window === "undefined") {
      setStepIndex(next);
      return;
    }
    const currentY = window.scrollY;
    setStepIndex(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentY, behavior: "auto" });
      });
    });
  }, []);
  const undoLastChange = useCallback(() => {
    const previous = undoHistoryRef.current.shift();
    setUndoCount(undoHistoryRef.current.length);
    if (!previous) return;
    undoApplyingRef.current = true;
    setReport(previous.report);
    setStepIndex(previous.stepIndex);
  }, []);
  const openNativePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    input.focus({ preventScroll: true });
    try {
      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
        return;
      }
    } catch {
      // Fallback: Browser opens picker natively when supported.
    }
    try {
      input.click();
    } catch {
      // Final fallback: focused input allows manual typing.
    }
  };
  const getTodayDateInputValue = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  useEffect(() => {
    if (!isRml || mode !== "create") return;
    const today = getTodayDateInputValue();
    setReport((prev) => {
      if (String(prev.date ?? "").trim()) return prev;
      return { ...prev, date: today };
    });
  }, [isRml, mode]);
  useEffect(() => {
    const currentSnapshot = JSON.stringify({ report, stepIndex });
    if (!undoLastSnapshotRef.current) {
      undoLastSnapshotRef.current = currentSnapshot;
      return;
    }
    if (undoApplyingRef.current) {
      undoApplyingRef.current = false;
      undoLastSnapshotRef.current = currentSnapshot;
      return;
    }
    if (undoLastSnapshotRef.current === currentSnapshot) return;
    undoHistoryRef.current = [
      JSON.parse(undoLastSnapshotRef.current) as { report: Tagesbericht; stepIndex: number },
      ...undoHistoryRef.current,
    ].slice(0, 10);
    setUndoCount(undoHistoryRef.current.length);
    undoLastSnapshotRef.current = currentSnapshot;
  }, [report, stepIndex]);
  const focusDictationTarget = useCallback((key: string) => {
    const target = dictationTargetsRef.current[key];
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, []);
  const insertDictationText = useCallback((key: string, spokenText: string) => {
    const target = dictationTargetsRef.current[key];
    if (!target) return;
    const text = spokenText.trim();
    if (!text) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const glueLeft = before && !/\s$/.test(before) ? " " : "";
    const glueRight = after && !/^\s/.test(after) ? " " : "";
    const nextValue = `${before}${glueLeft}${text}${glueRight}${after}`;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) {
      setter.call(target, nextValue);
    } else {
      target.value = nextValue;
    }
    const caret = (before + glueLeft + text).length;
    target.setSelectionRange(caret, caret);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);
  const startDictationForTarget = useCallback(
    (key: string) => {
      if (activeDictationTargetRef.current === key && dictationShouldRunRef.current) {
        dictationShouldRunRef.current = false;
        if (dictationRecognitionRef.current) {
          try {
            dictationRecognitionRef.current.stop();
          } catch {
            // ignore
          }
          dictationRecognitionRef.current = null;
        }
        activeDictationTargetRef.current = null;
        setActiveDictationTarget(null);
        return;
      }
      dictationShouldRunRef.current = false;
      if (dictationRecognitionRef.current) {
        try {
          dictationRecognitionRef.current.stop();
        } catch {
          // ignore
        }
        dictationRecognitionRef.current = null;
      }
      const speechApiWindow = window as Window & {
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          maxAlternatives: number;
          onresult: ((event: unknown) => void) | null;
          onerror: ((event: unknown) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          maxAlternatives: number;
          onresult: ((event: unknown) => void) | null;
          onerror: ((event: unknown) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
      };
      const RecognitionCtor = speechApiWindow.SpeechRecognition ?? speechApiWindow.webkitSpeechRecognition;
      focusDictationTarget(key);
      if (!RecognitionCtor) return;
      dictationShouldRunRef.current = true;
      activeDictationTargetRef.current = key;
      setActiveDictationTarget(key);
      const launchRecognition = () => {
        if (!dictationShouldRunRef.current || activeDictationTargetRef.current !== key) return;
        const recognition = new RecognitionCtor();
        recognition.lang = "de-DE";
        recognition.interimResults = false;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: unknown) => {
          const e = event as {
            resultIndex?: number;
            results?: ArrayLike<ArrayLike<{ transcript?: string }> & { isFinal?: boolean }>;
          };
          const results = e.results;
          if (!results) return;
          let transcript = "";
          const startIndex = e.resultIndex ?? 0;
          for (let i = startIndex; i < results.length; i += 1) {
            const result = results[i];
            const piece = result?.[0]?.transcript ?? "";
            if ((result as { isFinal?: boolean })?.isFinal !== false) transcript += piece;
          }
          if (transcript.trim()) {
            const targetKey = activeDictationTargetRef.current;
            if (targetKey) insertDictationText(targetKey, transcript);
          }
        };
        recognition.onerror = (event: unknown) => {
          const speechError = event as { error?: string };
          if (speechError.error === "not-allowed" || speechError.error === "service-not-allowed") {
            dictationShouldRunRef.current = false;
            activeDictationTargetRef.current = null;
            setActiveDictationTarget(null);
          }
        };
        recognition.onend = () => {
          if (dictationRecognitionRef.current === recognition) {
            dictationRecognitionRef.current = null;
          }
          if (dictationShouldRunRef.current && activeDictationTargetRef.current === key) {
            setTimeout(() => {
              launchRecognition();
            }, 120);
            return;
          }
          if (activeDictationTargetRef.current === key) {
            activeDictationTargetRef.current = null;
            setActiveDictationTarget(null);
          }
        };
        dictationRecognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          dictationShouldRunRef.current = false;
          activeDictationTargetRef.current = null;
          setActiveDictationTarget(null);
        }
      };
      launchRecognition();
    },
    [focusDictationTarget, insertDictationText]
  );

  const MAX_CUSTOM_WORK_CYCLES = 6;

  useEffect(() => {
    return () => {
      Object.values(geoSearchDebounceRef.current).forEach((t) => {
        if (t) clearTimeout(t);
      });
      dictationShouldRunRef.current = false;
      if (dictationRecognitionRef.current) {
        try {
          dictationRecognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const saveCustomWorkCycles = useCallback(
    async (list: string[]) => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? null,
          custom_work_cycles: list,
        },
        { onConflict: "id" }
      );
      if (error) {
        console.error("[custom_work_cycles] save failed", error);
        alert("Eigene Arbeitstakte konnten nicht gespeichert werden: " + error.message);
      }
    },
    [supabase]
  );
   // ✅ hält immer den aktuellsten Report
  const reportRef = useRef(report);
  const drillerDeviceHistoryRef = useRef<Record<string, string>>({});
  const rmlBohrhelferHistoryByUserRef = useRef<Record<string, string[]>>({});
  const prevDrillerNameRef = useRef<string>("");
  const prevRmlHelperUserKeyRef = useRef<string>("");

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DRILLER_DEVICE_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        drillerDeviceHistoryRef.current = parsed as Record<string, string>;
      }
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(RML_BOHRHELFER_HISTORY_BY_USER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const normalized: Record<string, string[]> = {};
      Object.entries(parsed).forEach(([userKey, helperList]) => {
        if (!Array.isArray(helperList)) return;
        normalized[userKey] = helperList
          .map((v) => String(v ?? "").trim())
          .filter((v) => isKnownRmlBohrhelferOption(v));
      });
      rmlBohrhelferHistoryByUserRef.current = normalized;
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const drillerKey = normalizeDrillerName(report.signatures?.drillerName);
    const device = String(report.device ?? "").trim();
    if (!drillerKey || !device) return;
    if (drillerDeviceHistoryRef.current[drillerKey] === device) return;
    drillerDeviceHistoryRef.current = {
      ...drillerDeviceHistoryRef.current,
      [drillerKey]: device,
    };
    try {
      localStorage.setItem(
        DRILLER_DEVICE_HISTORY_KEY,
        JSON.stringify(drillerDeviceHistoryRef.current)
      );
    } catch {
      // ignore storage errors
    }
  }, [report.signatures?.drillerName, report.device]);

  useEffect(() => {
    if (!isRml || mode !== "create") return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data?.user;
      const userKey =
        String(user?.id ?? "").trim() || String(user?.email ?? "").trim().toLowerCase();
      if (!userKey) return;

      let nextCounter = 1;
      if (user?.id) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("rml_report_counter")
          .eq("id", user.id)
          .maybeSingle();
        if (!profileErr) {
          const fromProfile = parsePositiveInteger(
            (profile as { rml_report_counter?: unknown } | null)?.rml_report_counter
          );
          if (fromProfile != null) nextCounter = fromProfile;
        }
      }

      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(RML_REPORT_COUNTER_BY_USER_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const fromLocal = parsePositiveInteger((parsed as Record<string, unknown>)[userKey]);
            if (fromLocal != null) nextCounter = fromLocal;
          }
        } catch {
          // ignore malformed storage
        }
      }

      if (!mounted) return;
      setRmlNextReportNr(nextCounter);
      setReport((prev) => ({ ...prev, berichtNr: String(nextCounter) }));
    })();
    return () => {
      mounted = false;
    };
  }, [isRml, mode, supabase]);

  const persistRmlCounter = useCallback(
    async (nextCounter: number) => {
      const safeNext = Math.max(1, Math.floor(nextCounter));
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const userKey =
        String(user?.id ?? "").trim() || String(user?.email ?? "").trim().toLowerCase();
      if (!userKey) return;

      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(RML_REPORT_COUNTER_BY_USER_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          const map =
            parsed && typeof parsed === "object" && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : {};
          map[userKey] = safeNext;
          localStorage.setItem(RML_REPORT_COUNTER_BY_USER_KEY, JSON.stringify(map));
        } catch {
          // ignore storage errors
        }
      }

      if (!user?.id) return;
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? null,
          rml_report_counter: safeNext,
        },
        { onConflict: "id" }
      );
      if (!error) return;
      const code = String((error as { code?: unknown })?.code ?? "");
      if (code === "PGRST204" || code === "42703") return;
      console.warn("[rml_report_counter] save failed", error);
    },
    [supabase]
  );

  useEffect(() => {
    if (mode !== "create") return;
    const drillerKey = normalizeDrillerName(report.signatures?.drillerName);
    const prevDrillerKey = prevDrillerNameRef.current;
    if (drillerKey === prevDrillerKey) return;
    prevDrillerNameRef.current = drillerKey;
    if (!drillerKey) return;
    const rememberedDevice = drillerDeviceHistoryRef.current[drillerKey];
    if (!rememberedDevice) return;
    if (!isKnownDeviceOption(rememberedDevice)) return;
    if (String(report.device ?? "").trim() === rememberedDevice) return;
    setReport((prev) => ({ ...prev, device: rememberedDevice }));
  }, [mode, report.signatures?.drillerName, report.device]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("custom_work_cycles")
        .eq("id", user.id)
        .single();
      if (!mounted) return;
      if (!error && Array.isArray(profile?.custom_work_cycles)) {
        setCustomWorkCycles(profile.custom_work_cycles);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (clientSigEnabled) return;
    const hasClientSig =
      Boolean(report?.signatures?.clientOrManagerSigPng) ||
      Boolean(report?.signatures?.clientOrManagerName);
    if (hasClientSig) setClientSigEnabled(true);
  }, [clientSigEnabled, report?.signatures?.clientOrManagerSigPng, report?.signatures?.clientOrManagerName]);

  // ======================
// 🧩 LOAD REPORT (EDIT MODE)
// ======================
  useEffect(() => {
    if (mode !== "edit" || !reportId) return;

    console.log("[Form] load report for edit", reportId);

    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("data")
        .eq("id", reportId)
        .single();

      if (error || !data?.data) {
        console.error(error);
        alert("Bericht konnte nicht geladen werden");
        return;
      }

      // ✅ DEBUG: was kommt wirklich aus der DB?
      console.log("[EDIT LOAD] raw from db", data.data);
      const dbReport = data.data as Partial<Tagesbericht>;
      console.log("[EDIT LOAD] client", dbReport.client);
      console.log("[EDIT LOAD] project", dbReport.project);
      console.log("[EDIT LOAD] vehicles", dbReport.vehicles);
      console.log("[EDIT LOAD] worker0 name", dbReport.workers?.[0]?.name);
      setReport({ ...normalizeTagesbericht(data.data), reportType });
    };

    load();
  }, [mode, reportId]);

  // ======================
  // 🧩 LOAD DRAFT (CREATE MODE)
  // ======================
  useEffect(() => {
    if (mode !== "create" || !hasDraftId) return;

    const supabase = createClient();
    const loadDraft = async () => {
      const { data, error } = await supabase
        .from("drafts")
        .select("data")
        .eq("id", draftId)
        .single();

      if (error || !data?.data) {
        console.error(error);
        alert("Entwurf konnte nicht geladen werden");
        return;
      }

      setReport({ ...normalizeTagesbericht(data.data), reportType });
    };

    loadDraft();
  }, [mode, draftId, hasDraftId]);

  useEffect(() => {
    if (mode !== "create") return;
    if (enforcedProjectId) return;
    if (projectId) return;
    if (hasDraftId) return;
    if (initialProjectChoiceDone) return;

    const boot = async () => {
      await loadMyProjects();
      setProjectModalOpen(true);
    };
    void boot();
  }, [mode, projectId, hasDraftId, initialProjectChoiceDone, loadMyProjects, enforcedProjectId]);

  useEffect(() => {
    if (mode !== "create") return;
    if (hasDraftId) return;
    if (!effectiveProjectId) return;
    void applyProjectPrefill(effectiveProjectId, false);
  }, [mode, hasDraftId, effectiveProjectId, applyProjectPrefill]);

  useEffect(() => {
    if (mode !== "create" || hasDraftId) return;
    if (!effectiveProjectId) return;
    if (weatherPrefillProjectRef.current === effectiveProjectId) return;

    const supabase = createClient();
    let cancelled = false;

    const deriveWeatherConditions = (args: {
      weatherCode: number | null;
      precipitationMm: number | null;
      tempMinC: number | null;
    }): ("trocken" | "regen" | "frost")[] => {
      const set = new Set<"trocken" | "regen" | "frost">();
      const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
      const snowOrFrostCodes = new Set([71, 73, 75, 77, 85, 86, 45, 48]);

      if ((args.precipitationMm ?? 0) > 0 || (args.weatherCode != null && rainCodes.has(args.weatherCode))) {
        set.add("regen");
      }
      if ((args.tempMinC ?? 999) <= 0 || (args.weatherCode != null && snowOrFrostCodes.has(args.weatherCode))) {
        set.add("frost");
      }
      if (!set.has("regen")) {
        set.add("trocken");
      }
      return Array.from(set);
    };

    const hydrateWeatherFromProject = async () => {
      const { data: projectRow, error: projectErr } = await supabase
        .from("projects")
        .select("mymaps_url")
        .eq("id", effectiveProjectId)
        .single();

      if (cancelled) return;
      if (projectErr || !projectRow?.mymaps_url) return;

      try {
        const res = await fetch(
          `/api/project-weather?mymapsUrl=${encodeURIComponent(projectRow.mymaps_url)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const payload = (await res.json()) as {
          current?: { weatherCode?: number | null; weather_code?: number | null };
          today?: { tempMinC?: number | null; tempMaxC?: number | null; precipitationMm?: number | null };
        };
        if (cancelled) return;

        const weatherCode =
          typeof payload.current?.weatherCode === "number"
            ? payload.current.weatherCode
            : typeof payload.current?.weather_code === "number"
              ? payload.current.weather_code
              : null;
        const tempMinC =
          typeof payload.today?.tempMinC === "number" ? payload.today.tempMinC : null;
        const tempMaxC =
          typeof payload.today?.tempMaxC === "number" ? payload.today.tempMaxC : null;
        const precipitationMm =
          typeof payload.today?.precipitationMm === "number" ? payload.today.precipitationMm : null;

        const conditions = deriveWeatherConditions({ weatherCode, precipitationMm, tempMinC });

        setReport((prev) => ({
          ...prev,
          weather: {
            ...(prev.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
            conditions,
            tempMaxC,
            tempMinC,
          },
        }));

        weatherPrefillProjectRef.current = effectiveProjectId;
      } catch {
        // silent fallback: user can still fill weather manually
      }
    };

    hydrateWeatherFromProject();
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, mode, hasDraftId]);

  // ================== DRAFT + REPORT SAVE HANDLERS ==================
  const {
    setSaveDraftHandler,
    setSaveReportHandler,
    setUndoHandler,
    setUndoCount: setGlobalUndoCount,
    triggerSaveReport,
  } = useDraftActions();

  useEffect(() => {
    setUndoHandler(() => {
      undoLastChange();
    });
    return () => {
      setUndoHandler(null);
    };
  }, [setUndoHandler, undoLastChange]);

  useEffect(() => {
    setGlobalUndoCount(undoCount);
  }, [undoCount, setGlobalUndoCount]);

  useEffect(() => {
    return () => {
      setGlobalUndoCount(0);
    };
  }, [setGlobalUndoCount]);
  const saveDraftToServer = useCallback(
    async ({
      showSuccess = false,
      showError = false,
    }: {
      showSuccess?: boolean;
      showError?: boolean;
    } = {}) => {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        if (showError) alert("Nicht eingeloggt.");
        return false;
      }

      const pid = enforcedProjectId ?? effectiveProjectId ?? null;
      const currentReport = reportRef.current;
      const reportForSave =
        pid != null
          ? await hydrateReportWithProject(currentReport, pid)
          : currentReport;

      const title =
        reportForSave?.project?.trim()
          ? `${reportTitleLabel} – ${reportForSave.project} (${reportForSave.date})`
          : `${reportTitleLabel} Entwurf (${reportForSave?.date ?? ""})`;

      const { error } = await supabase.from("drafts").insert({
        user_id: user.id,
        project_id: pid,
        report_type: reportType,
        title,
        data: reportForSave,
      });

      if (error) {
        console.error(error);
        if (showError) alert("Entwurf speichern fehlgeschlagen: " + error.message);
        return false;
      }

      if (showSuccess) alert("Entwurf gespeichert ✅");
      return true;
    },
    [effectiveProjectId, enforcedProjectId, hydrateReportWithProject, reportTitleLabel, reportType]
  );

  useEffect(() => {
    console.log("[Form] register save handlers");
    const supabase = createClient();

    // ✅ Draft speichern
    setSaveDraftHandler(async () => {
      await saveDraftToServer({ showSuccess: true, showError: true });
    });

    // ✅ Finalen Bericht speichern
    setSaveReportHandler(async () => {
      if (savingRef.current) return; // ✅ blockt doppeltes Triggern (UI-seitig)
      savingRef.current = true;

      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return alert("Nicht eingeloggt.");
        
        const target = await ensureSaveTarget();
        if (!target) return;

        const { scope, projectId: pid } = target;
        const finalProjectId = enforcedProjectId ?? (scope === "project" ? pid ?? null : null);

        // ✅ DB-seitig: gleicher Key für denselben Save-Vorgang
        if (!reportSaveKeyRef.current) {
          reportSaveKeyRef.current = crypto.randomUUID();
        }

        let currentReport = reportRef.current;
        const legalBreakCheck = enforceLegalBreakRules(currentReport);
        if (legalBreakCheck.warnings.length > 0) {
          const preview = legalBreakCheck.warnings.slice(0, 4).join("\n");
          const suffix =
            legalBreakCheck.warnings.length > 4
              ? `\n+ ${legalBreakCheck.warnings.length - 4} weitere Zeile(n)`
              : "";
          const ok = window.confirm(
            `Gesetzliche Pausenregel nicht erfüllt:\n${preview}${suffix}\n\nAutomatisch ergänzen und weiter speichern?`
          );
          if (!ok) {
            alert("Speichern abgebrochen. Bitte Pausen ergänzen.");
            return;
          }
          currentReport = legalBreakCheck.report;
          reportRef.current = legalBreakCheck.report;
          setReport(legalBreakCheck.report);
        }
        const projectScoped = finalProjectId;
        let reportForSave = await hydrateReportWithProject(currentReport, projectScoped);
        let usedRmlReportNr: number | null = null;
        if (reportType === "tagesbericht_rhein_main_link") {
          const currentNr = parsePositiveInteger(reportForSave.berichtNr) ?? rmlNextReportNr ?? 1;
          usedRmlReportNr = currentNr;
          reportForSave = { ...reportForSave, berichtNr: String(currentNr) };
        }
        if (projectScoped && prefillProjectId && prefillProjectId !== projectScoped) {
          console.warn("[PROJECT PREFILL GUARD] prefill project changed before save", {
            prefillProjectId,
            projectScoped,
          });
        }
        console.log("[SAVE] currentReport.client", currentReport.client);
        console.log("[SAVE] currentReport.project", currentReport.project);
        console.log("[SAVE] currentReport.vehicles", currentReport.vehicles);
        console.log("[SAVE] currentReport.worker0 name", currentReport.workers?.[0]?.name);

        const normalizeTitlePart = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
        let title: string;
        if (reportType === "tagesbericht") {
          const auftragsnummer = normalizeTitlePart(reportForSave?.aNr);
          const name = normalizeTitlePart(reportForSave?.signatures?.drillerName);
          const datum = normalizeTitlePart(reportForSave?.date);

          if (!auftragsnummer) {
            alert('Pflichtfeld fehlt: "Auftragsnummer" muss vor dem Speichern ausgefüllt sein.');
            if (useStepper) setStepIndex(0);
            return;
          }
          if (!name) {
            alert('Pflichtfeld fehlt: "Name" (Unterschrift Bohrmeister) muss vor dem Speichern ausgefüllt sein.');
            if (useStepper) setStepIndex(8);
            return;
          }
          if (!datum) {
            alert('Pflichtfeld fehlt: "Datum" muss vor dem Speichern ausgefüllt sein.');
            if (useStepper) setStepIndex(0);
            return;
          }

          title = `${auftragsnummer}_${name}_${datum}`;
        } else if (reportType === "tagesbericht_rhein_main_link") {
          const geraeteRaw = String(reportForSave?.vehicles ?? "");
          const geraeteCount = geraeteRaw
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean).length;
          const deCount = Math.max(1, geraeteCount);
          const datum = normalizeTitlePart(reportForSave?.date);
          const bohrung = normalizeTitlePart(reportForSave?.bohrungNr);
          const safeBohrung = bohrung || "Bohrung";
          title = `BTB_DE${deCount}_${datum}_${safeBohrung}`;
        } else {
          title =
            reportForSave?.project?.trim()
              ? `${reportTitleLabel} – ${reportForSave.project} (${reportForSave.date})`
              : `${reportTitleLabel} (${reportForSave?.date ?? ""})`;
        }

        // ===============================
// EDIT → UPDATE
// ===============================
if (mode === "edit") {
  if (!reportId) {
    alert("Fehler: reportId fehlt im Edit-Modus");
    return;
  }

  const { data: updatedReport, error } = await supabase
    .from("reports")
      .update({
      title,
      data: reportForSave,
      status: "final",
      project_id: finalProjectId,
    })
    .eq("id", reportId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(error);
    alert("Bericht aktualisieren fehlgeschlagen: " + error.message);
    return;
  }
  if (!updatedReport?.id) {
    alert("Bericht wurde nicht aktualisiert. Bitte Seite neu laden und erneut speichern.");
    return;
  }

  alert("Bericht aktualisiert ✅");
  return;
}

// ===============================
// CREATE → INSERT (wie vorher)
// ===============================
  if (!reportSaveKeyRef.current) {
    reportSaveKeyRef.current = crypto.randomUUID();
  }

  const idempotencyKey = reportSaveKeyRef.current!;

  const payload = {
    user_id: user.id,
    project_id: finalProjectId,
    report_type: reportType,
    title,
    data: reportForSave,
    status: "final",
    idempotency_key: idempotencyKey,
  } satisfies {
    user_id: string;
    project_id: string | null;
    report_type: "tagesbericht" | "tagesbericht_rhein_main_link";
    title: string;
    data: Tagesbericht;
    status: "final";
    idempotency_key: string;
  };

  const { error } = await supabase.from("reports").insert(payload);

  if (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") {
      reportSaveKeyRef.current = null;
      alert("Bericht war schon gespeichert ✅");
      return;
    }

    console.error(error);
    alert("Bericht speichern fehlgeschlagen: " + error.message);
    return;
  }

  reportSaveKeyRef.current = null;
  if (reportType === "tagesbericht_rhein_main_link") {
    const nextCounter = Math.max(1, (usedRmlReportNr ?? rmlNextReportNr ?? 1) + 1);
    setRmlNextReportNr(nextCounter);
    setReport((prev) => ({ ...prev, berichtNr: String(nextCounter) }));
    await persistRmlCounter(nextCounter);
  }
  alert("Bericht gespeichert ✅");
      } finally {
        savingRef.current = false;
      }
    });

    return () => {
      console.log("[Form] cleanup save handlers");
      setSaveDraftHandler(null);
      setSaveReportHandler(null);
    };
  }, [
    setSaveDraftHandler,
    setSaveReportHandler,
    requireProjectId,
    ensureSaveTarget,
    effectiveProjectId,
    hydrateReportWithProject,
    mode,
    enforcedProjectId,
    prefillProjectId,
    reportId,
    reportTitleLabel,
    reportType,
    rmlNextReportNr,
    persistRmlCounter,
    saveDraftToServer,
    saveScope,
    useStepper,
  ]);
  // ========================================================

  const sigClientRef = useRef<SignatureCanvas>(null);
  const sigDrillerRef = useRef<SignatureCanvas>(null);
  const skipSigHydrateRef = useRef(false);

  useEffect(() => {
  if (mode !== "edit") return;
  if (skipSigHydrateRef.current) {
    skipSigHydrateRef.current = false;
    return;
  }

  const c = report?.signatures?.clientOrManagerSigPng;
  const d = report?.signatures?.drillerSigPng;

  // erst nach Rendern reinladen
  requestAnimationFrame(() => {
    try {
      if (c && typeof c === "string" && c.startsWith("data:image")) {
        sigClientRef.current?.fromDataURL(c);
      } else {
        sigClientRef.current?.clear();
      }

      if (d && typeof d === "string" && d.startsWith("data:image")) {
        sigDrillerRef.current?.fromDataURL(d);
      } else {
        sigDrillerRef.current?.clear();
      }
    } catch (e) {
      console.warn("Signature hydrate failed", e);
    }
  });
}, [mode, report?.signatures?.clientOrManagerSigPng, report?.signatures?.drillerSigPng]);

  const saveClientSignature = () => {
    skipSigHydrateRef.current = true;
    const clientPng = sigClientRef.current?.isEmpty()
      ? ""
      : sigClientRef.current?.getTrimmedCanvas().toDataURL("image/png");

    setReport((p) => ({
      ...p,
      signatures: {
        ...(p.signatures ?? { clientOrManagerName: "", drillerName: "" }),
        clientOrManagerSigPng: clientPng || "",
      },
    }));

  };

  const saveDrillerSignature = () => {
    skipSigHydrateRef.current = true;
    const drillerPng = sigDrillerRef.current?.isEmpty()
      ? ""
      : sigDrillerRef.current?.getTrimmedCanvas().toDataURL("image/png");

    setReport((p) => ({
      ...p,
      signatures: {
        ...(p.signatures ?? { clientOrManagerName: "", drillerName: "" }),
        drillerSigPng: drillerPng || "",
      },
    }));

  };

  const clearClientSig = () => {
    sigClientRef.current?.clear();
    saveClientSignature();
  };

  const clearDrillerSig = () => {
    sigDrillerRef.current?.clear();
    saveDrillerSignature();
  };

  function update<K extends keyof Tagesbericht>(key: K, value: Tagesbericht[K]) {
    setReport((prev) => ({ ...prev, [key]: value }));
  }
  const safeWorkTimes = Array.isArray(report.workTimeRows) && report.workTimeRows.length
    ? report.workTimeRows
    : [emptyTimeRow()];

  const safeBreaks = Array.isArray(report.breakRows) && report.breakRows.length
    ? report.breakRows
    : [emptyTimeRow()];

  function setWorkTimeRow(i: number, patch: Partial<TimeRange>) {
    setReport((p) => {
      const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, workTimeRows: rows };
    });
  }

  function setTimeRowName(i: number, name: string) {
    setReport((p) => {
      const workRows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      const breakRows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      workRows[i] = { ...workRows[i], name };
      breakRows[i] = { ...breakRows[i], name };
      return { ...p, workTimeRows: workRows, breakRows };
    });
  }

  function addWorkTimeRow() {
    setReport((p) => {
      const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      if (rows.length >= 3) return p;
      rows.push(emptyTimeRow());
      return { ...p, workTimeRows: rows };
    });
  }

  function removeLastWorkTimeRow() {
    setReport((p) => {
      const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      if (rows.length <= 1) return p;
      rows.pop();
      return { ...p, workTimeRows: rows };
    });
  }

  function setBreakRow(i: number, patch: Partial<TimeRange>) {
    setReport((p) => {
      const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, breakRows: rows };
    });
  }

  function addBreakRow() {
    setReport((p) => {
      const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      if (rows.length >= 3) return p;
      rows.push(emptyTimeRow());
      return { ...p, breakRows: rows };
    });
  }

  function removeLastBreakRow() {
    setReport((p) => {
      const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      if (rows.length <= 1) return p;
      rows.pop();
      return { ...p, breakRows: rows };
    });
  }

  function addWorkAndBreakRow() {
    setReport((p) => {
      const workRows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      const breakRows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      if (workRows.length >= 3 || breakRows.length >= 3) return p;
      workRows.push(emptyTimeRow());
      breakRows.push(emptyTimeRow());
      return { ...p, workTimeRows: workRows, breakRows };
    });
  }

  function removeLastWorkAndBreakRow() {
    setReport((p) => {
      const workRows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      const breakRows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
      if (workRows.length <= 1 || breakRows.length <= 1) return p;
      workRows.pop();
      breakRows.pop();
      return { ...p, workTimeRows: workRows, breakRows };
    });
  }

  function saveDraftToLocalStorage() {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(reportRef.current));
      alert("Entwurf lokal gespeichert ✅");
    } catch (e) {
      console.error("Local draft save failed", e);
      alert("Lokales Speichern fehlgeschlagen.");
    }
  }

  const buildPdfPayload = (source: Tagesbericht): Tagesbericht => {
    const fixedCustomCycles = Array.isArray(customWorkCycles) ? customWorkCycles : [];
    if (source.workCyclesSame) {
      return { ...source, customWorkCycles: fixedCustomCycles };
    }
    const workers = Array.isArray(source.workers) ? source.workers : [];
    const union: string[] = [];
    const pushCycle = (label: string) => {
      const trimmed = String(label ?? "").trim();
      if (!trimmed) return;
      if (!union.includes(trimmed)) union.push(trimmed);
    };
    workers.forEach((w) => {
      const list = Array.isArray(w.workCycles) ? w.workCycles : [];
      list.forEach(pushCycle);
    });
    const cycles =
      union.length
        ? union
        : Array.isArray(source.workCycles) && source.workCycles.length
          ? source.workCycles
          : [""];
    const mappedWorkers = workers.map((w) => {
      const list = Array.isArray(w.workCycles) ? w.workCycles : [];
      const st = Array.isArray(w.stunden) ? w.stunden : [];
      const map = new Map<string, string>();
      list.forEach((label, idx) => {
        const key = String(label ?? "").trim();
        if (!key) return;
        map.set(key, st[idx] ?? "");
      });
      const aligned = cycles.map((label) => map.get(label) ?? "");
      return { ...w, stunden: aligned };
    });
    return {
      ...source,
      workCycles: cycles,
      workers: mappedWorkers,
      customWorkCycles: fixedCustomCycles,
    };
  };

  async function downloadPdfToLocal() {
    try {
      const payload = buildPdfPayload(reportRef.current);
      const res = await fetch(pdfEndpointBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("PDF-Download fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const nameBase =
        payload?.project?.trim()
          ? `tagesbericht-${payload.project}-${payload.date ?? ""}`
          : `tagesbericht-${payload?.date ?? "draft"}`;
      const safeName = nameBase.replace(/[^a-z0-9-_]+/gi, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF download failed", e);
      alert("PDF-Download fehlgeschlagen.");
    }
  }

  useEffect(() => {
    if (mode === "edit" || hasDraftId) return;
    try {
      localStorage.removeItem(draftBlockStorageKey);
    } catch (e) {
      console.warn("Failed to clear draft block on mount", e);
    }
    if (localDraftLoadedRef.current) {
      autoSaveReadyRef.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setReport({ ...normalizeTagesbericht(parsed), reportType });
    } catch (e) {
      console.warn("Local draft load failed", e);
    } finally {
      autoSaveReadyRef.current = true;
    }
  }, [mode, draftId, hasDraftId]);

  useEffect(() => {
    if (mode === "edit" || hasDraftId) return;
    const saveNow = () => {
      if (isAutoSaveBlocked()) return;
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(reportRef.current));
      } catch (e) {
        console.warn("Local draft save on pagehide failed", e);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode, draftId, hasDraftId]);

  useEffect(() => {
    if (mode === "edit" || hasDraftId) return;
    return () => {
      if (isAutoSaveBlocked()) return;
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(reportRef.current));
      } catch (e) {
        console.warn("Local draft save on route change failed", e);
      }
    };
  }, [pathname, mode, hasDraftId]);

  useEffect(() => {
    if (mode === "edit" || hasDraftId) return;
    if (!autoSaveReadyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (isAutoSaveBlocked()) return;
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(report));
      } catch (e) {
        console.warn("Local draft autosave failed", e);
      }
    }, 250);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [report, mode, draftId, hasDraftId]);

  useEffect(() => {
    return () => {
      if (mode === "edit" || hasDraftId) return;
      if (isAutoSaveBlocked()) return;
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(report));
      } catch (e) {
        console.warn("Local draft save on unmount failed", e);
      }
    };
  }, [mode, draftId, hasDraftId, report]);

  function fillTestData() {
    const base = createDefaultTagesbericht();
    const today = new Date().toISOString().slice(0, 10);

    if (reportType === "tagesbericht_rhein_main_link") {
      const rml: Tagesbericht = {
        ...base,
        reportType,
        date: today,
        project: "",
        firma: "",
        client: "",
        device: "Atego Tyroller",
        plz: "79312",
        ort: "Emmendingen",
        bohrungNr: "B1",
        berichtNr: "1",
        aNr: "DE-2026-001",
        bohrrichtung: "vertikal",
        winkelHorizontal: "0",
        winkelNord: "0",
        verrohrungAbGok: "0.0",
        vehicles: "LKW, Radlader/Dumper, Wasserwagen, Kompressor",
        workTimeRows: [{ name: "Max Mustermann", from: "07:00", to: "17:00" }],
        breakRows: [{ name: "Max Mustermann", from: "12:00", to: "12:30" }],
        weather: { conditions: ["regen", "frost"], tempMaxC: 3.1, tempMinC: 0.2 },
        ruhewasserVorArbeitsbeginnM: 1.2,
        waterLevelRows: [
          { time: "07:00", meters: "1.2" },
          { time: "09:30", meters: "1.4" },
          { time: "12:00", meters: "1.6" },
          { time: "15:30", meters: "1.8" },
        ],
        verrohrungRows: [
          { diameter: "146", meters: "6" },
          { diameter: "178", meters: "7.5" },
          { diameter: "220", meters: "9" },
          { diameter: "273", meters: "10.5" },
        ],
        transportRows: [{ from: "Lager", to: "Baustelle", km: 12, time: "00:20" }],
        workers: [
          { ...emptyWorker(), name: "Max Mustermann" },
          { ...emptyWorker(), name: "Leon Beispiel" },
          { ...emptyWorker(), name: "Mira Test" },
          { ...emptyWorker(), name: "Sven Probe" },
        ],
        tableRows: Array.from({ length: 10 }, (_, i) => {
          const bohrverfahren = RML_BOHRVERFAHREN_OPTIONS[i % RML_BOHRVERFAHREN_OPTIONS.length];
          const bohrkronenOptions = getRmlAufschlussKronenOptions(bohrverfahren);
          const bohrkrone = bohrkronenOptions[i % bohrkronenOptions.length] ?? "146";
          const von = "0.0";
          const bis = String(6 + i * 1.5);
          const verrohrungDm = RML_KRONE_OPTIONS[i % RML_KRONE_OPTIONS.length];
          const sptValues = ["8/12/15", "10/14/18", "12/16/20", "14/18/22", "16/20/24"];
          return {
            ...emptyTableRow(),
            verrohrtFlags: [bohrverfahren],
            boNr: bohrkrone,
            gebohrtVon: von,
            gebohrtBis: bis,
            verrohrtVon: bis,
            verrohrtBis: verrohrungDm,
            spt: i < sptValues.length ? sptValues[i] : "",
            hindernisZeit: "",
          };
        }),
        pegelAusbauRows: [
          { ...emptyPegelAusbauRow(), bohrNr: "B1", filterVon: "4", filterBis: "8", pegelDm: '4"', tonVon: "0.0", tonBis: "1.5" },
          { ...emptyPegelAusbauRow(), bohrNr: "B2", filterVon: "5", filterBis: "9", pegelDm: '3"', tonVon: "0.0", tonBis: "1.5" },
          { ...emptyPegelAusbauRow(), bohrNr: "B3", filterVon: "6", filterBis: "10", pegelDm: '4"', tonVon: "0.0", tonBis: "1.5" },
          { ...emptyPegelAusbauRow(), bohrNr: "B4", filterVon: "7", filterBis: "11", pegelDm: '3"', tonVon: "0.0", tonBis: "1.5" },
          { ...emptyPegelAusbauRow(), bohrNr: "B5", filterVon: "8", filterBis: "12", pegelDm: '4"', tonVon: "0.0", tonBis: "1.5" },
          { ...emptyPegelAusbauRow(), bohrNr: "B6", filterVon: "9", filterBis: "13", pegelDm: '3"', tonVon: "0.0", tonBis: "1.5" },
        ],
        otherWork:
          "Baustelle eingerichtet, Bohransatz eingemessen und Arbeitsbereich gesichert.\n" +
          "B1 bis 6,0 m, B2 bis 7,5 m und B3 bis 9,0 m hergestellt; Bohrgut fortlaufend dokumentiert.\n" +
          "Wasserspiegelmessungen 07:00/09:30/12:00/15:30 aufgenommen, keine besonderen Vorkommnisse.",
        besucher: "Bauleitung 10:30",
        sheVorfaelle: "Keine",
        toolBoxTalks:
          "Material nachgeliefert, Zufahrt freigeräumt und Arbeitsbereich nachverdichtet.\n" +
          "Abstimmung mit Bauleitung zur nächsten Bohrposition durchgeführt.\n" +
          "Gerätecheck abgeschlossen, Kompressorleitung geprüft.",
        taeglicheUeberpruefungBg:
          "Betriebsflüssigkeiten | Schmierung | Bolzen, Lager | Seile und Tragmittel | Hydraulik | ev. Leckagen",
        signatures: {
          clientOrManagerName: "Herr Bauleiter",
          drillerName: "Max Mustermann",
          clientOrManagerSigPng: "",
          drillerSigPng: "",
        },
      };

      setReport(rml);
      return;
    }

    const filled: Tagesbericht = {
      ...base,
      reportType,
      date: today,
      project: "Baustelle Freiburg Nord",
      client: "Stadt Freiburg",
      firma: "Drillexpert GmbH",
      berichtNr: "RML-001",
      plz: "79312",
      ort: "Emmendingen",
      bohrungNr: "B1",
      bohrrichtung: "vertikal",
      winkelHorizontal: "0",
      winkelNord: "0",
      verrohrungAbGok: "0.0",
      name: "Team A",
      vehicles: "LKW 7.5t, Bohrgerät X2, Sprinter",
      aNr: "A-2026-001",
      device: "Atego Tyroller",
      trailer: "Anhänger 2t",
      workTimeRows: [
        { name: "Max Mustermann", from: "07:00", to: "12:00" }, // 5h
        { name: "Erika Beispiel", from: "12:30", to: "16:30" }, // 4h
        { name: "Tim B.", from: "07:30", to: "15:30" }, // 8h
      ],
      breakRows: [
        { name: "Max Mustermann", from: "09:30", to: "09:45" }, // 0.25h
        { name: "Erika Beispiel", from: "14:00", to: "14:15" }, // 0.25h
        { name: "Tim B.", from: "11:30", to: "12:00" }, // 0.5h
      ],
      weather: {
        conditions: ["trocken", "regen"],
        tempMaxC: 18,
        tempMinC: 8,
      },
      transportRows: [
        { from: "Lager", to: "Baustelle", km: 12, time: "00:20" },
        { from: "Baustelle", to: "Deponie", km: 8, time: "00:15" },
      ],
      ruhewasserVorArbeitsbeginnM: 2.4,
      entfernungWohnwagenBaustelleKm: 12,
      entfernungWohnwagenBaustelleZeit: "00:20",
      workStartBefore: 6.5,
      workStartAfter: 7.0,
      workStartDistanceM: 250,
      workCycles: ["Transport", "Umsetzen", "Kernbohren", "Schachten"],
      workCyclesSame: false,
      otherWork: "Material angeliefert, Baustelle eingerichtet, Sondierung.",
      remarks: "Keine besonderen Vorkommnisse.",
      besucher: "Bauleitung vor Ort 10:30",
      sheVorfaelle: "Keine",
      toolBoxTalks: "Sicherheitsunterweisung 07:00",
      taeglicheUeberpruefungBg: "Durchgeführt und dokumentiert",
      tableRows: Array.from({ length: 5 }, (_, i) => ({
        ...emptyTableRow(),
        boNr: `B${i + 1}`,
        gebohrtVon: "0.0",
        gebohrtBis: String(6 + i * 1.5),
        verrohrtVon: "0.0",
        verrohrtBis: String(5 + i * 1.2),
        verrohrtFlags: i % 4 === 0 ? ["RB"] : i % 4 === 1 ? ["EK"] : i % 4 === 2 ? ["DK"] : ["S"],
        vollbohrVon: String(6 + i * 1.5),
        vollbohrBis: String(7 + i * 1.7),
        hindernisVon: String(2 + i * 0.4),
        hindernisBis: String(2.1 + i * 0.4),
        hindernisZeit: "00:05",
        schachtenVon: "0.5",
        schachtenBis: "1.0",
        schachtenZeit: "00:15",
        probenFlags: i % 2 === 0 ? ["GP", "KP"] : ["SP", "WP"],
        probenValues: i % 2 === 0 ? { GP: "2", KP: "1" } : { SP: "1", WP: "1" },
        indivProbe: i % 2 === 0 ? "A1" : "B2",
        spt: "12/30",
        verfuellung: {
          tonVon: "0.0",
          tonBis: "1.5",
          bohrgutVon: "1.5",
          bohrgutBis: String(6 + i * 1.5),
          zementBentVon: String(6 + i * 1.5),
          zementBentBis: String(6.5 + i * 1.5),
          betonVon: String(6.5 + i * 1.5),
          betonBis: String(7 + i * 1.7),
        },
      })),
      workers: [
        {
          ...emptyWorker(),
          name: "Max Mustermann",
          wochenendfahrt: "0",
          ausfallStd: "0",
          ausloeseT: true,
          ausloeseN: false,
          arbeitsakteNr: "AA-1001",
          // 4.75h (5h - 0.25h) -> passt
          stunden: ["2", "1.5", "1.25", ""],
        },
        {
          ...emptyWorker(),
          name: "Erika Beispiel",
          wochenendfahrt: "0",
          ausfallStd: "0.5",
          ausloeseT: false,
          ausloeseN: true,
          arbeitsakteNr: "AA-1002",
          // 3.75h (4h - 0.25h) -> passt
          stunden: ["1", "1.25", "1.5", ""],
        },
        {
          ...emptyWorker(),
          name: "Tim B.",
          wochenendfahrt: "0",
          ausfallStd: "0",
          ausloeseT: false,
          ausloeseN: false,
          arbeitsakteNr: "AA-1003",
          // 7.25h (8h - 0.5h) -> absichtlich falsch (soll rot werden)
          stunden: ["2", "2", "2", "1.25"],
        },
      ],
      umsetzenRows: Array.from({ length: 3 }, (_, i) => ({
        ...emptyUmsetzenRow(),
        von: `P${i + 1}`,
        auf: `P${i + 2}`,
        entfernungM: String(80 + i * 15),
        zeit: "00:15",
        begruendung: "Umsetzen",
        wartezeit: String(i),
      })),
      pegelAusbauRows: Array.from({ length: 3 }, (_, i) => ({
        ...emptyPegelAusbauRow(),
        bohrNr: `B${i + 1}`,
        pegelDm: i % 2 === 0 ? "DN100" : "DN80",
        sumpfVon: String(8 + i),
        sumpfBis: String(9 + i),
        filterVon: String(4 + i),
        filterBis: String(8 + i),
        rohrePvcVon: "0.0",
        rohrePvcBis: String(4 + i),
        aufsatzPvcVon: String(4 + i),
        aufsatzPvcBis: String(4.5 + i),
        aufsatzStahlVon: String(4.5 + i),
        aufsatzStahlBis: String(5 + i),
        filterkiesVon: String(4 + i),
        filterkiesBis: String(8 + i),
        tonVon: "0.0",
        tonBis: "1.5",
        sandVon: "1.5",
        sandBis: "2.5",
        zementBentVon: String(8 + i),
        zementBentBis: String(8.5 + i),
        bohrgutVon: String(8.5 + i),
        bohrgutBis: String(9 + i),
        sebaKap: i % 2 === 0,
        boKap: i % 3 === 0,
        hydrKap: i % 2 === 1,
        fernGask: i % 3 === 1,
        passavant: i % 2 === 0,
        betonSockel: true,
        abstHalter: i % 2 === 0 ? "1" : "",
        klarpump: i % 3 === 2,
        filterkiesKoernung: i % 2 === 0 ? "2/8" : "8/16",
      })),
      signatures: {
        clientOrManagerName: "Bauleiter: T. Becker",
        drillerName: "Max Mustermann",
        clientOrManagerSigPng: "",
        drillerSigPng: "",
      },
    };

    setReport(filled);
  }

  const resetAllInputs = () => {
    if (!confirm("Alle Eingaben wirklich löschen?")) return;
    const base = createDefaultTagesbericht();
    setReport({
      ...base,
      reportType,
      tableRows: Array.isArray(base.tableRows) && base.tableRows.length ? base.tableRows : [emptyTableRow()],
      workers: Array.isArray(base.workers) && base.workers.length ? base.workers : [emptyWorker()],
      umsetzenRows: Array.isArray(base.umsetzenRows) && base.umsetzenRows.length ? base.umsetzenRows : [emptyUmsetzenRow()],
      pegelAusbauRows: Array.isArray(base.pegelAusbauRows) && base.pegelAusbauRows.length ? base.pegelAusbauRows : [emptyPegelAusbauRow()],
    });
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }
  };

  async function openTestPdf() {
    const ua = navigator.userAgent;
    const isIPhoneLike = /iPhone|iPod/i.test(ua);
    const isIPadLike =
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && !isIPhoneLike);
    const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
    const isTabletLike = isIPadLike || isAndroidTablet;
    const previewWindow = window.open("", "_blank");
    try {
      const payload = buildPdfPayload(report);
      const res = await fetch(pdfEndpointBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (previewWindow) previewWindow.close();
        alert("PDF-API Fehler");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewWindow) {
        if (isTabletLike) {
          try {
            previewWindow.document.open();
            previewWindow.document.write(
              `<!doctype html><html><head><meta charset="utf-8"><title>PDF Vorschau</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#111;"><embed src="${url}" type="application/pdf" style="width:100vw;height:100vh;" /><div style="position:fixed;right:12px;bottom:12px;padding:8px 12px;background:#fff;border-radius:10px;font:12px sans-serif;">Falls leer: kurz tippen oder Seite neu laden.</div></body></html>`
            );
            previewWindow.document.close();
          } catch {
            previewWindow.location.href = url;
          }
        } else {
          previewWindow.location.href = url;
        }
      } else {
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      if (previewWindow) previewWindow.close();
      console.error("PDF preview failed", e);
      alert("PDF-Vorschau fehlgeschlagen.");
    }
  }

  /** ---------- Tabelle ---------- */
  const MAX_TABLE_ROWS = isRml ? 10 : 5;
  const MAX_UMSETZEN_ROWS = 3;
  const MAX_PEGEL_ROWS = isRml ? 10 : 3;
  const MAX_WATER_LEVEL_ROWS = 4;
  const MAX_VERROHRUNG_ROWS = 4;

  const safeTableRows = useMemo<TableRow[]>(
    () => (Array.isArray(report.tableRows) && report.tableRows.length ? report.tableRows : [emptyTableRow()]),
    [report.tableRows]
  );
  useEffect(() => {
    if (!isRml) return;
    setReport((prev) => {
      const rows = Array.isArray(prev.tableRows) && prev.tableRows.length ? prev.tableRows : [emptyTableRow()];
      let changed = false;
      const nextRows = rows.map((row) => {
        const bohrverfahren = String(row.verrohrtFlags?.[0] ?? "").trim();
        const allowedKronen = getRmlAufschlussKronenOptions(bohrverfahren);
        const currentKrone = String(row.boNr ?? "").trim();
        if (!allowedKronen.length) return row;
        if (currentKrone && allowedKronen.includes(currentKrone)) return row;
        changed = true;
        return { ...row, boNr: allowedKronen[0] ?? "" };
      });
      if (!changed) return prev;
      return { ...prev, tableRows: nextRows };
    });
  }, [isRml]);
  const safeWaterLevelRows = useMemo(
    () =>
      Array.isArray(report.waterLevelRows) && report.waterLevelRows.length
        ? report.waterLevelRows
        : [{ time: "", meters: "" }],
    [report.waterLevelRows]
  );
  const safeVerrohrungRows = useMemo(
    () =>
      Array.isArray(report.verrohrungRows) && report.verrohrungRows.length
        ? report.verrohrungRows
        : [{ diameter: "", meters: "" }],
    [report.verrohrungRows]
  );
  const rmlWaterTimeOptions = useMemo(
    () =>
      Array.from({ length: 96 }, (_, idx) => {
        const h = String(Math.floor(idx / 4)).padStart(2, "0");
        const m = String((idx % 4) * 15).padStart(2, "0");
        return `${h}:${m}`;
      }),
    []
  );

  function setRow(i: number, patch: Partial<TableRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.tableRows) && p.tableRows.length ? [...p.tableRows] : [emptyTableRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, tableRows: rows };
    });
  }
  function setWaterLevelRow(i: number, patch: { time?: string; meters?: string }) {
    setReport((p) => {
      const rows = Array.isArray(p.waterLevelRows) && p.waterLevelRows.length ? [...p.waterLevelRows] : [{ time: "", meters: "" }];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, waterLevelRows: rows };
    });
  }
  function addWaterLevelRow() {
    setReport((p) => {
      const rows = Array.isArray(p.waterLevelRows) && p.waterLevelRows.length ? [...p.waterLevelRows] : [{ time: "", meters: "" }];
      if (rows.length >= MAX_WATER_LEVEL_ROWS) return { ...p, waterLevelRows: rows };
      rows.push({ time: "", meters: "" });
      return { ...p, waterLevelRows: rows };
    });
  }
  function removeLastWaterLevelRow() {
    setReport((p) => {
      const rows = Array.isArray(p.waterLevelRows) && p.waterLevelRows.length ? [...p.waterLevelRows] : [{ time: "", meters: "" }];
      if (rows.length <= 1) return { ...p, waterLevelRows: rows };
      rows.pop();
      return { ...p, waterLevelRows: rows };
    });
  }
  function setVerrohrungRow(i: number, patch: { diameter?: string; meters?: string }) {
    setReport((p) => {
      const rows = Array.isArray(p.verrohrungRows) && p.verrohrungRows.length ? [...p.verrohrungRows] : [{ diameter: "", meters: "" }];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, verrohrungRows: rows };
    });
  }
  function addVerrohrungRow() {
    setReport((p) => {
      const rows = Array.isArray(p.verrohrungRows) && p.verrohrungRows.length ? [...p.verrohrungRows] : [{ diameter: "", meters: "" }];
      if (rows.length >= MAX_VERROHRUNG_ROWS) return { ...p, verrohrungRows: rows };
      rows.push({ diameter: "", meters: "" });
      return { ...p, verrohrungRows: rows };
    });
  }
  function removeLastVerrohrungRow() {
    setReport((p) => {
      const rows = Array.isArray(p.verrohrungRows) && p.verrohrungRows.length ? [...p.verrohrungRows] : [{ diameter: "", meters: "" }];
      if (rows.length <= 1) return { ...p, verrohrungRows: rows };
      rows.pop();
      return { ...p, verrohrungRows: rows };
    });
  }

  const getSptParts = (raw?: string | null) => {
    const parts = String(raw ?? "").split("/");
    return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""] as const;
  };

  const normalizeSptSchlagInput = (value: string) => {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    if (!digits) return "";
    const parsed = Number.parseInt(digits, 10);
    if (!Number.isFinite(parsed)) return "";
    return String(Math.min(Math.max(parsed, 0), SPT_MAX_SCHLAEGE));
  };
  const parseSptCm = (value: string | undefined) => {
    if (!value) return null;
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(Math.max(parsed, 0), SPT_DEFAULT_SEGMENT_CM);
  };
  const sptCmOverrideKey = (rowIndex: number, segmentIndex: 0 | 1 | 2) => `${rowIndex}-${segmentIndex}`;
  const parseDepthNumber = (value: string | undefined | null) => {
    if (!value) return null;
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const formatDepthNumber = (value: number) => {
    const fixed = (Math.round(value * 100) / 100).toFixed(2);
    return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  };
  const getSptSegmentCm = (rowIndex: number, segmentIndex: 0 | 1 | 2, schlagValue: string) => {
    const normalizedSchlag = normalizeSptSchlagInput(schlagValue);
    if (!normalizedSchlag) return 0;
    if (normalizedSchlag === String(SPT_MAX_SCHLAEGE)) {
      const override = parseSptCm(rmlSptCmOverrides[sptCmOverrideKey(rowIndex, segmentIndex)]);
      return override ?? 0;
    }
    return SPT_DEFAULT_SEGMENT_CM;
  };
  const getSptDepthMeters = (
    rowIndex: number,
    s1: string,
    s2: string,
    s3: string,
    overrides?: Record<string, string>
  ) => {
    const segments = [s1, s2, s3] as const;
    let cm = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const s = normalizeSptSchlagInput(segments[i] ?? "");
      if (!s) continue;
      if (s === String(SPT_MAX_SCHLAEGE)) {
        const key = sptCmOverrideKey(rowIndex, i as 0 | 1 | 2);
        const overrideRaw = overrides ? overrides[key] : rmlSptCmOverrides[key];
        const override = parseSptCm(overrideRaw);
        cm += override ?? 0;
      } else {
        cm += SPT_DEFAULT_SEGMENT_CM;
      }
      if (s === String(SPT_MAX_SCHLAEGE)) break;
    }
    return (cm / 100).toFixed(2);
  };
  const getSptBisFromVon = (
    rowIndex: number,
    vonRaw: string,
    s1: string,
    s2: string,
    s3: string,
    overrides?: Record<string, string>
  ) => {
    const von = parseDepthNumber(vonRaw);
    if (von == null) return "";
    const depth = Number(getSptDepthMeters(rowIndex, s1, s2, s3, overrides));
    if (!Number.isFinite(depth)) return "";
    return formatDepthNumber(von + depth);
  };

  const setSptPart = (rowIndex: number, partIndex: 0 | 1 | 2, value: string) => {
    const current = safeTableRows[rowIndex];
    const parts = [...getSptParts(current?.spt)] as string[];
    parts[partIndex] = normalizeSptSchlagInput(value);
    const next = parts.map((p) => p.trim());
    const spt = next.some((p) => p.length > 0) ? next.join("/") : "";
    const bis = getSptBisFromVon(rowIndex, String(current?.gebohrtVon ?? ""), next[0] ?? "", next[1] ?? "", next[2] ?? "");
    setRow(rowIndex, { spt, gebohrtBis: bis });
  };

  function addRow() {
    setReport((p) => {
      const rows = Array.isArray(p.tableRows) && p.tableRows.length ? [...p.tableRows] : [emptyTableRow()];
      if (rows.length >= MAX_TABLE_ROWS) return { ...p, tableRows: rows };
      rows.push(emptyTableRow());
      return { ...p, tableRows: rows };
    });
  }

  function removeLastRow() {
    setReport((p) => {
      const rows = Array.isArray(p.tableRows) && p.tableRows.length ? [...p.tableRows] : [emptyTableRow()];
      if (rows.length <= 1) return { ...p, tableRows: rows };
      rows.pop();
      return { ...p, tableRows: rows };
    });
  }

  /** ---------- Umsetzen ---------- */
  const safeUmsetzen = useMemo<UmsetzenRow[]>(
    () => (Array.isArray(report.umsetzenRows) && report.umsetzenRows.length ? report.umsetzenRows : [emptyUmsetzenRow()]),
    [report.umsetzenRows]
  );

  function setUmsetzenRow(i: number, patch: Partial<UmsetzenRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.umsetzenRows) && p.umsetzenRows.length ? [...p.umsetzenRows] : [emptyUmsetzenRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, umsetzenRows: rows };
    });
  }

  function addUmsetzenRow() {
    setReport((p) => {
      const rows = Array.isArray(p.umsetzenRows) && p.umsetzenRows.length ? [...p.umsetzenRows] : [];
      if (rows.length >= MAX_UMSETZEN_ROWS) return { ...p, umsetzenRows: rows.length ? rows : [emptyUmsetzenRow()] };
      rows.push(emptyUmsetzenRow());
      return { ...p, umsetzenRows: rows.length ? rows : [emptyUmsetzenRow()] };
    });
  }

  function removeLastUmsetzenRow() {
    setReport((p) => {
      const rows = Array.isArray(p.umsetzenRows) && p.umsetzenRows.length ? [...p.umsetzenRows] : [emptyUmsetzenRow()];
      if (rows.length <= 1) return { ...p, umsetzenRows: rows };
      rows.pop();
      return { ...p, umsetzenRows: rows };
    });
  }

  const extractPostalCode = (value: string) => {
    const m = value.match(/\b\d{4,5}\b/);
    return m ? m[0] : "";
  };

  const fetchRmlOrtSuggestions = async (query: string): Promise<GeoSuggestion[]> => {
    if (!isRml || query.trim().length < 2) {
      setRmlOrtSuggestions([]);
      return [];
    }
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = (await res.json()) as { suggestions?: GeoSuggestion[] };
      if (!res.ok || !Array.isArray(payload.suggestions)) {
        setRmlOrtSuggestions([]);
        return [];
      }
      const suggestions = payload.suggestions.slice(0, 6);
      setRmlOrtSuggestions(suggestions);
      return suggestions;
    } catch {
      setRmlOrtSuggestions([]);
      return [];
    }
  };

  const fetchPostalCodeByCoords = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `/api/geo/postal-code?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
        { cache: "no-store" }
      );
      const payload = (await res.json()) as { postalCode?: string; place?: string };
      if (!res.ok) return "";
      return String(payload.postalCode ?? "").trim();
    } catch {
      return "";
    }
  };

  const triggerRmlOrtSearchDebounced = (query: string) => {
    const key = "rml-ort";
    const existing = geoSearchDebounceRef.current[key];
    if (existing) clearTimeout(existing);
    geoSearchDebounceRef.current[key] = setTimeout(() => {
      void fetchRmlOrtSuggestions(query);
    }, 200);
  };

  const chooseRmlOrtSuggestion = (suggestion: GeoSuggestion) => {
    const placeName = String(suggestion.shortLabel ?? suggestion.label.split(",")[0] ?? suggestion.label).trim();
    const detectedPlz = String(suggestion.postalCode ?? "").trim() || extractPostalCode(suggestion.label);
    update("ort", placeName);
    if (detectedPlz) {
      update("plz", detectedPlz);
    } else {
      void fetchPostalCodeByCoords(suggestion.lat, suggestion.lon).then((postalCode) => {
        if (postalCode) update("plz", postalCode);
      });
    }
    setRmlOrtSuggestions([]);
  };

  const resolveRmlOrtOnBlur = async (rawOrt: string) => {
    if (!isRml) return;
    const value = rawOrt.trim();
    if (!value) {
      setRmlOrtSuggestions([]);
      return;
    }
    const suggestions = await fetchRmlOrtSuggestions(value);
    if (!suggestions.length) return;
    const exact = suggestions.find((s) => s.shortLabel.trim().toLowerCase() === value.toLowerCase()) ?? suggestions[0];
    const detectedPlz = String(exact.postalCode ?? "").trim() || extractPostalCode(exact.label);
    if (detectedPlz) {
      update("plz", detectedPlz);
      return;
    }
    const fallbackPlz = await fetchPostalCodeByCoords(exact.lat, exact.lon);
    if (fallbackPlz) update("plz", fallbackPlz);
  };

  const umsetzenFieldKey = (index: number, field: "von" | "auf") => `${index}-${field}`;

  const fetchGeoSuggestions = async (index: number, field: "von" | "auf", query: string) => {
    const key = umsetzenFieldKey(index, field);
    if (query.trim().length < 3) {
      setUmsetzenSuggestions((prev) => ({ ...prev, [key]: [] }));
      return;
    }
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = (await res.json()) as { suggestions?: GeoSuggestion[] };
      if (!res.ok || !Array.isArray(payload.suggestions)) {
        setUmsetzenSuggestions((prev) => ({ ...prev, [key]: [] }));
        return;
      }
      const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
      setUmsetzenSuggestions((prev) => ({ ...prev, [key]: suggestions.slice(0, 6) }));
    } catch {
      setUmsetzenSuggestions((prev) => ({ ...prev, [key]: [] }));
    }
  };

  const triggerGeoSearchDebounced = (index: number, field: "von" | "auf", query: string) => {
    const key = umsetzenFieldKey(index, field);
    const existing = geoSearchDebounceRef.current[key];
    if (existing) clearTimeout(existing);
    geoSearchDebounceRef.current[key] = setTimeout(() => {
      void fetchGeoSuggestions(index, field, query);
    }, 250);
  };

  const formatDurationHHMM = (seconds: number) => {
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const updateUmsetzenRoute = async (index: number) => {
    const from = umsetzenCoords[umsetzenFieldKey(index, "von")];
    const to = umsetzenCoords[umsetzenFieldKey(index, "auf")];
    if (!from || !to) return;
    setUmsetzenRouteLoading((prev) => ({ ...prev, [index]: true }));
    try {
      const url = `/api/geo/route?fromLat=${encodeURIComponent(String(from.lat))}&fromLon=${encodeURIComponent(String(from.lon))}&toLat=${encodeURIComponent(String(to.lat))}&toLon=${encodeURIComponent(String(to.lon))}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as { distanceMeters?: number; durationSeconds?: number };
      if (!res.ok || typeof payload.distanceMeters !== "number" || typeof payload.durationSeconds !== "number") {
        setUmsetzenRouteLoading((prev) => ({ ...prev, [index]: false }));
        return;
      }
      setUmsetzenRow(index, {
        entfernungM: String(Math.round(payload.distanceMeters / 1000)),
        zeit: formatDurationHHMM(payload.durationSeconds),
      });
    } catch {
      // no-op: user can still fill manually
    } finally {
      setUmsetzenRouteLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const setUmsetzenLocationText = (index: number, field: "von" | "auf", value: string) => {
    if (field === "von") setUmsetzenRow(index, { von: value });
    else setUmsetzenRow(index, { auf: value });

    const key = umsetzenFieldKey(index, field);
    setUmsetzenCoords((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    triggerGeoSearchDebounced(index, field, value);
  };

  const chooseUmsetzenSuggestion = (index: number, field: "von" | "auf", suggestion: GeoSuggestion) => {
    const placeName = String(suggestion.shortLabel ?? suggestion.label.split(",")[0] ?? suggestion.label).trim();
    if (field === "von") setUmsetzenRow(index, { von: placeName });
    else setUmsetzenRow(index, { auf: placeName });
    const key = umsetzenFieldKey(index, field);
    setUmsetzenCoords((prev) => ({ ...prev, [key]: { lat: suggestion.lat, lon: suggestion.lon, label: placeName } }));
    setUmsetzenSuggestions((prev) => ({ ...prev, [key]: [] }));
    void updateUmsetzenRoute(index);
  };

  const transportFieldKey = (index: number, field: "from" | "to") => `transport-${index}-${field}`;

  const fetchTransportSuggestions = async (index: number, field: "from" | "to", query: string) => {
    const key = transportFieldKey(index, field);
    if (query.trim().length < 3) {
      setTransportSuggestions((prev) => ({ ...prev, [key]: [] }));
      return;
    }
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = (await res.json()) as { suggestions?: GeoSuggestion[] };
      if (!res.ok || !Array.isArray(payload.suggestions)) {
        setTransportSuggestions((prev) => ({ ...prev, [key]: [] }));
        return;
      }
      const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
      setTransportSuggestions((prev) => ({ ...prev, [key]: suggestions.slice(0, 6) }));
    } catch {
      setTransportSuggestions((prev) => ({ ...prev, [key]: [] }));
    }
  };

  const triggerTransportSearchDebounced = (index: number, field: "from" | "to", query: string) => {
    const key = transportFieldKey(index, field);
    const existing = geoSearchDebounceRef.current[key];
    if (existing) clearTimeout(existing);
    geoSearchDebounceRef.current[key] = setTimeout(() => {
      void fetchTransportSuggestions(index, field, query);
    }, 250);
  };

  const updateTransportRoute = async (index: number) => {
    const from = transportCoords[transportFieldKey(index, "from")];
    const to = transportCoords[transportFieldKey(index, "to")];
    if (!from || !to) return;
    setTransportRouteLoading((prev) => ({ ...prev, [index]: true }));
    try {
      const url = `/api/geo/route?fromLat=${encodeURIComponent(String(from.lat))}&fromLon=${encodeURIComponent(String(from.lon))}&toLat=${encodeURIComponent(String(to.lat))}&toLon=${encodeURIComponent(String(to.lon))}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as { distanceMeters?: number; durationSeconds?: number };
      if (!res.ok || typeof payload.distanceMeters !== "number" || typeof payload.durationSeconds !== "number") {
        setTransportRouteLoading((prev) => ({ ...prev, [index]: false }));
        return;
      }
      setTransportRow(index, {
        km: Math.round(payload.distanceMeters / 1000),
        time: formatDurationHHMM(payload.durationSeconds),
      });
    } catch {
      // no-op: user can still fill manually
    } finally {
      setTransportRouteLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const setTransportLocationText = (index: number, field: "from" | "to", value: string) => {
    if (field === "from") setTransportRow(index, { from: value });
    else setTransportRow(index, { to: value });
    const key = transportFieldKey(index, field);
    setTransportCoords((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    triggerTransportSearchDebounced(index, field, value);
  };

  const chooseTransportSuggestion = (index: number, field: "from" | "to", suggestion: GeoSuggestion) => {
    const placeName = String(suggestion.shortLabel ?? suggestion.label.split(",")[0] ?? suggestion.label).trim();
    if (field === "from") setTransportRow(index, { from: placeName });
    else setTransportRow(index, { to: placeName });
    const key = transportFieldKey(index, field);
    setTransportCoords((prev) => ({ ...prev, [key]: { lat: suggestion.lat, lon: suggestion.lon, label: placeName } }));
    setTransportSuggestions((prev) => ({ ...prev, [key]: [] }));
    void updateTransportRoute(index);
  };

  const MAX_TRANSPORT_ROWS = 2;
  const safeTransport = (Array.isArray(report.transportRows) && report.transportRows.length
    ? report.transportRows
    : [emptyTransportRow()]).slice(0, MAX_TRANSPORT_ROWS);

  function setTransportRow(i: number, patch: Partial<TransportRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [emptyTransportRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, transportRows: rows };
    });
  }

  function addTransportRow() {
    setReport((p) => {
      const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [];
      if (rows.length >= MAX_TRANSPORT_ROWS) return { ...p, transportRows: rows.length ? rows : [emptyTransportRow()] };
      rows.push(emptyTransportRow());
      return { ...p, transportRows: rows.length ? rows : [emptyTransportRow()] };
    });
  }

  function removeLastTransportRow() {
    setReport((p) => {
      const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [emptyTransportRow()];
      if (rows.length > MAX_TRANSPORT_ROWS) rows.length = MAX_TRANSPORT_ROWS;
      if (rows.length <= 1) return { ...p, transportRows: rows };
      rows.pop();
      return { ...p, transportRows: rows };
    });
  }
  /** ---------- Workers ---------- */
  const safeWorkers = useMemo<WorkerRow[]>(
    () => (Array.isArray(report.workers) && report.workers.length ? report.workers : [emptyWorker()]),
    [report.workers]
  );

  function setWorker(i: number, patch: Partial<WorkerRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, workers: rows };
    });
  }

  function setWorkerNameAt(i: number, name: string) {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      while (rows.length <= i) rows.push(emptyWorker());
      rows[i] = { ...rows[i], name };
      return { ...p, workers: rows };
    });
  }
  const bohrhelferNames = useMemo(() => {
    const rows = Array.isArray(report.workers) ? report.workers : [];
    const helpers = rows.slice(1).map((w) => String(w?.name ?? ""));
    return helpers.length ? helpers : [""];
  }, [report.workers]);

  useEffect(() => {
    if (!isRml || mode !== "create") return;
    const userKey = currentUserId || currentUserEmail;
    if (!userKey) return;
    const helperNames = bohrhelferNames.map((name) => String(name ?? "").trim());
    if (!helperNames.some(Boolean)) return;
    const previous = rmlBohrhelferHistoryByUserRef.current[userKey] ?? [];
    if (
      previous.length === helperNames.length &&
      previous.every((name, idx) => name === helperNames[idx])
    ) {
      return;
    }
    rmlBohrhelferHistoryByUserRef.current = {
      ...rmlBohrhelferHistoryByUserRef.current,
      [userKey]: helperNames,
    };
    try {
      localStorage.setItem(
        RML_BOHRHELFER_HISTORY_BY_USER_KEY,
        JSON.stringify(rmlBohrhelferHistoryByUserRef.current)
      );
    } catch {
      // ignore storage errors
    }
  }, [isRml, mode, currentUserId, currentUserEmail, bohrhelferNames]);

  useEffect(() => {
    if (!isRml || mode !== "create") return;
    const userKey = currentUserId || currentUserEmail;
    if (!userKey) return;
    if (prevRmlHelperUserKeyRef.current === userKey) return;
    prevRmlHelperUserKeyRef.current = userKey;
    const rememberedHelpers = rmlBohrhelferHistoryByUserRef.current[userKey] ?? [];
    if (!rememberedHelpers.length) return;
    setReport((prev) => {
      const rows = Array.isArray(prev.workers) && prev.workers.length ? [...prev.workers] : [emptyWorker()];
      const currentHelpers = rows.slice(1).map((w) => String(w?.name ?? "").trim());
      if (currentHelpers.some(Boolean)) return prev;
      while (rows.length < rememberedHelpers.length + 1) rows.push(emptyWorker());
      rememberedHelpers.forEach((name, idx) => {
        rows[idx + 1] = { ...rows[idx + 1], name };
      });
      return { ...prev, workers: rows };
    });
  }, [isRml, mode, currentUserId, currentUserEmail]);

  const setBohrhelferNameAt = (helperIndex: number, name: string) => {
    setWorkerNameAt(helperIndex + 1, name);
  };
  const addBohrhelfer = () => {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      const helperCount = Math.max(0, rows.length - 1);
      if (helperCount >= 3) return p;
      rows.push(emptyWorker());
      return { ...p, workers: rows };
    });
  };
  const removeBohrhelfer = () => {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      if (rows.length <= 2) {
        if (rows[1]) rows[1] = { ...rows[1], name: "" };
        return { ...p, workers: rows };
      }
      rows.pop();
      return { ...p, workers: rows };
    });
  };

  const getWorkerCycles = (w: WorkerRow) =>
    Array.isArray(w.workCycles) && w.workCycles.length
      ? w.workCycles
      : Array.isArray(report.workCycles) && report.workCycles.length
        ? report.workCycles
        : [""];

  const setWorkerCycles = (workerIndex: number, next: string[]) => {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      const w = rows[workerIndex] ?? emptyWorker();
      const cycles = next.length ? next : [""];
      const st = Array.isArray(w.stunden) ? [...w.stunden] : [];
      while (st.length < cycles.length) st.push("");
      const trimmed = st.slice(0, cycles.length);
      rows[workerIndex] = { ...w, workCycles: cycles, stunden: trimmed };
      return { ...p, workers: rows };
    });
  };

  const parseTimeToMinutes = (value?: string | null) => {
    if (!value) return null;
    const [h, m] = value.split(":").map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const formatQuarterHours = (hours: number) => {
    const rounded = Math.round(hours * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
    return String(rounded);
  };

  const formatHours = (minutes: number) => {
    const hours = Math.max(0, minutes / 60);
    const rounded = Math.round(hours * 4) / 4;
    return formatQuarterHours(rounded);
  };

  const formatHoursFromHours = (hours: number | null) => {
    if (hours == null) return "";
    const rounded = Math.round(hours * 4) / 4;
    return formatQuarterHours(rounded);
  };
  const parseHoursInput = (value?: string | null) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const areHourValuesEqual = (a?: string | null, b?: string | null) => {
    const aNum = parseHoursInput(a);
    const bNum = parseHoursInput(b);
    if (aNum == null || bNum == null) return false;
    return Math.abs(aNum - bNum) < 0.01;
  };
  const sumHourStrings = (values: string[]) => {
    let sum = 0;
    let has = false;
    values.forEach((value) => {
      const parsed = parseHoursInput(value);
      if (parsed == null) return;
      sum += parsed;
      has = true;
    });
    return has ? formatHoursFromHours(sum) : "";
  };
  const isAssignedCycle = (cycle: string | undefined | null) => {
    const raw = String(cycle ?? "").trim();
    return raw !== "" && raw !== "__custom__";
  };
  const calcTaktHoursForWorker = (worker: WorkerRow, workerCycles: string[]) => {
    const st = Array.isArray(worker.stunden) ? worker.stunden : [];
    let sum = 0;
    let has = false;
    workerCycles.forEach((cycle, idx) => {
      if (!isAssignedCycle(cycle)) return;
      const val = st[idx] ?? "";
      const num = Number(String(val ?? "").replace(",", "."));
      if (Number.isFinite(num)) {
        sum += num;
        has = true;
      }
    });
    return has ? sum : null;
  };

  const isQuarterInput = (value?: string | null) => {
    const raw = String(value ?? "").trim();
    if (!raw) return true;
    const num = Number(raw.replace(",", "."));
    if (!Number.isFinite(num)) return false;
    return Math.abs(num * 4 - Math.round(num * 4)) < 1e-6;
  };

  const hasInvalidStunden = (worker: WorkerRow) => {
    const st = Array.isArray(worker.stunden) ? worker.stunden : [];
    return st.some((val) => !isQuarterInput(val));
  };

  const getTimeHoursStringForWorker = (workerIndex: number) => {
    const workMin = calcWorkMinutesForWorker(workerIndex);
    if (workMin == null) return "";
    return formatHours(Math.max(0, workMin - calcBreakMinutesForWorker(workerIndex)));
  };

  const getTaktHoursStringForWorker = (worker: WorkerRow) => {
    const workerCycles = getWorkerCycles(worker);
    const taktHours = calcTaktHoursForWorker(worker, workerCycles);
    return formatHoursFromHours(taktHours) || "0";
  };

  const isWorkerMismatch = (worker: WorkerRow, workerIndex: number) => {
    const taktStr = getTaktHoursStringForWorker(worker);
    const timeStr = getTimeHoursStringForWorker(workerIndex);
    return Boolean(taktStr) && Boolean(timeStr) && taktStr !== timeStr;
  };

  const sharedStunden = useMemo(() => {
    const cycles = Array.isArray(report.workCycles) ? report.workCycles : [];
    const first = Array.isArray(report.workers) && report.workers.length ? report.workers[0] : emptyWorker();
    const st = Array.isArray(first.stunden) ? [...first.stunden] : [];
    while (st.length < Math.max(1, cycles.length)) st.push("");
    return st.slice(0, Math.max(1, cycles.length));
  }, [report.workers, report.workCycles]);

  const applySharedStunden = (next: string[]) => {
    setReport((p) => {
      const workers = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      const cyclesLen = Math.max(1, (Array.isArray(p.workCycles) ? p.workCycles.length : 1));
      const normalized = [...next];
      while (normalized.length < cyclesLen) normalized.push("");
      const updated = workers.map((w) => ({
        ...w,
        stunden: normalized.slice(0, cyclesLen),
      }));
      return { ...p, workers: updated };
    });
  };

  const syncTimeRows = (rows: TimeRange[]) => {
    if (!rows.length) return rows;
    const base = rows[0] ?? { from: "", to: "" };
    return rows.map((r) => ({
      ...r,
      from: base?.from ?? "",
      to: base?.to ?? "",
    }));
  };

  const areTimeRowsUniform = (rows: TimeRange[]) => {
    if (!rows.length) return true;
    const first = rows[0] ?? { from: "", to: "" };
    return rows.every((r) => (r?.from ?? "") === (first?.from ?? "") && (r?.to ?? "") === (first?.to ?? ""));
  };

  useEffect(() => {
    if (!report.workCyclesSame) return;
    applySharedStunden(sharedStunden);
  }, [report.workCyclesSame]);

  const calcWorkMinutesForWorker = (workerIndex: number) => {
    const rows = Array.isArray(report.workTimeRows) ? report.workTimeRows : [];
    const validRows = rows.filter((r) => parseTimeToMinutes(r?.from) != null && parseTimeToMinutes(r?.to) != null);
    if (validRows.length === 0) return null;
    const row = validRows[Math.min(workerIndex, validRows.length - 1)];
    const from = parseTimeToMinutes(row?.from);
    const to = parseTimeToMinutes(row?.to);
    if (from == null || to == null || to <= from) return null;
    return to - from;
  };

  const calcBreakMinutesForWorker = (workerIndex: number) => {
    const rows = Array.isArray(report.breakRows) ? report.breakRows : [];
    const validRows = rows.filter((r) => parseTimeToMinutes(r?.from) != null && parseTimeToMinutes(r?.to) != null);
    if (validRows.length === 0) return 0;
    const row = validRows[Math.min(workerIndex, validRows.length - 1)];
    const from = parseTimeToMinutes(row?.from);
    const to = parseTimeToMinutes(row?.to);
    if (from == null || to == null || to <= from) return 0;
    return to - from;
  };

  const enforceLegalBreakRules = useCallback((source: Tagesbericht) => {
    const parseLocalTimeToMinutes = (value?: string | null) => {
      if (!value) return null;
      const [h, m] = value.split(":").map((v) => Number(v));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const minutesToHHMM = (minutes: number) => {
      const clamped = Math.max(0, Math.floor(minutes));
      const hh = Math.floor(clamped / 60);
      const mm = clamped % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    const getRequiredBreakMinutes = (workMinutes: number) => {
      if (workMinutes > 9 * 60) return 45;
      if (workMinutes > 6 * 60) return 30;
      return 0;
    };

    const workRows = Array.isArray(source.workTimeRows) ? [...source.workTimeRows] : [];
    const breakRows = Array.isArray(source.breakRows) ? [...source.breakRows] : [];
    const maxRows = Math.max(workRows.length, breakRows.length, 1);
    let changed = false;
    const warnings: string[] = [];

    while (breakRows.length < maxRows) breakRows.push(emptyTimeRow());

    for (let i = 0; i < maxRows; i += 1) {
      const work = workRows[i];
      if (!work) continue;
      const workFrom = parseLocalTimeToMinutes(work.from);
      const workTo = parseLocalTimeToMinutes(work.to);
      if (workFrom == null || workTo == null || workTo <= workFrom) continue;

      const workMinutes = workTo - workFrom;
      const requiredBreak = getRequiredBreakMinutes(workMinutes);
      if (requiredBreak <= 0) continue;

      const breakRow = breakRows[i] ?? emptyTimeRow();
      const breakFrom = parseLocalTimeToMinutes(breakRow.from);
      const breakTo = parseLocalTimeToMinutes(breakRow.to);
      const breakMinutes =
        breakFrom != null && breakTo != null && breakTo > breakFrom ? breakTo - breakFrom : 0;

      if (breakMinutes >= requiredBreak) continue;

      const label = String(work.name ?? breakRow.name ?? `Zeile ${i + 1}`).trim() || `Zeile ${i + 1}`;
      warnings.push(`${label}: ${Math.round(workMinutes / 60)}h -> mindestens ${requiredBreak} min Pause`);

      const nextBreakTo = workTo;
      const nextBreakFrom = Math.max(workFrom, nextBreakTo - requiredBreak);
      breakRows[i] = {
        ...breakRow,
        name: String(breakRow.name ?? work.name ?? ""),
        from: minutesToHHMM(nextBreakFrom),
        to: minutesToHHMM(nextBreakTo),
      };
      changed = true;
    }

    return {
      changed,
      warnings,
      report: changed ? ({ ...source, breakRows } as Tagesbericht) : source,
    };
  }, []);
  const sharedTotalHours = useMemo(() => {
    const cycles = Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""];
    const filtered = cycles.map((cycle, idx) => (isAssignedCycle(cycle) ? sharedStunden[idx] ?? "" : ""));
    const sum = sumHourStrings(filtered);
    return sum || "0";
  }, [sharedStunden, report.workCycles]);
  const sharedExpectedHours = getTimeHoursStringForWorker(0);
  const sharedHoursMatch =
    Boolean(sharedTotalHours) &&
    Boolean(sharedExpectedHours) &&
    areHourValuesEqual(sharedTotalHours, sharedExpectedHours);

  useEffect(() => {
    const workers = Array.isArray(report.workers) && report.workers.length ? report.workers : [emptyWorker()];
    const currentWorkRows = Array.isArray(report.workTimeRows) && report.workTimeRows.length ? report.workTimeRows : [emptyTimeRow()];
    const currentBreakRows = Array.isArray(report.breakRows) && report.breakRows.length ? report.breakRows : [emptyTimeRow()];

    const targetLen = report.workCyclesSame ? 1 : Math.max(1, workers.length);
    const baseWork = currentWorkRows[0] ?? emptyTimeRow();
    const baseBreak = currentBreakRows[0] ?? emptyTimeRow();
    const nextWorkRows = Array.from({ length: targetLen }, (_, idx) => {
      const src = currentWorkRows[idx] ?? baseWork;
      const workerName = report.workCyclesSame ? String(workers[0]?.name ?? "") : String(workers[idx]?.name ?? "");
      return { ...src, name: workerName };
    });
    const nextBreakRows = Array.from({ length: targetLen }, (_, idx) => {
      const src = currentBreakRows[idx] ?? baseBreak;
      const workerName = report.workCyclesSame ? String(workers[0]?.name ?? "") : String(workers[idx]?.name ?? "");
      return { ...src, name: workerName };
    });

    const workRowsChanged =
      nextWorkRows.length !== currentWorkRows.length ||
      nextWorkRows.some((row, idx) => {
        const current = currentWorkRows[idx] ?? emptyTimeRow();
        return (row.name ?? "") !== (current.name ?? "") || (row.from ?? "") !== (current.from ?? "") || (row.to ?? "") !== (current.to ?? "");
      });

    const breakRowsChanged =
      nextBreakRows.length !== currentBreakRows.length ||
      nextBreakRows.some((row, idx) => {
        const current = currentBreakRows[idx] ?? emptyTimeRow();
        return (row.name ?? "") !== (current.name ?? "") || (row.from ?? "") !== (current.from ?? "") || (row.to ?? "") !== (current.to ?? "");
      });

    let workersChanged = false;
    const nextWorkers = workers.map((w) => {
      const workerCycles = Array.isArray(w.workCycles) && w.workCycles.length
        ? w.workCycles
        : Array.isArray(report.workCycles) && report.workCycles.length
          ? report.workCycles
          : [""];
      const taktHours = calcTaktHoursForWorker(w, workerCycles);
      const reine = formatHoursFromHours(taktHours) || "0";
      if (w.reineArbeitsStd !== reine) {
        workersChanged = true;
        return { ...w, reineArbeitsStd: reine };
      }
      return w;
    });

    if (!workRowsChanged && !breakRowsChanged && !workersChanged) return;

    setReport((p) => ({
      ...p,
      workers: nextWorkers,
      workTimeRows: nextWorkRows,
      breakRows: nextBreakRows,
    }));
  }, [report.workTimeRows, report.breakRows, report.workers, report.workCyclesSame]);
  function addWorker() {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      rows.push(emptyWorker());
      return { ...p, workers: rows };
    });
  }

  function removeLastWorker() {
    setReport((p) => {
      const rows = Array.isArray(p.workers) && p.workers.length ? [...p.workers] : [emptyWorker()];
      if (rows.length <= 1) return { ...p, workers: rows };
      rows.pop();
      return { ...p, workers: rows };
    });
  }

  /** ---------- Pegelausbau ---------- */
  const safePegel = useMemo<PegelAusbauRow[]>(
    () =>
      Array.isArray(report.pegelAusbauRows) && report.pegelAusbauRows.length
        ? report.pegelAusbauRows
        : [emptyPegelAusbauRow()],
    [report.pegelAusbauRows]
  );
  const bohrNrOptions = useMemo(() => {
    const rows = Array.isArray(report.tableRows) ? report.tableRows : [];
    const list = rows
      .map((r) => String(r.boNr ?? "").trim())
      .filter((v) => v.length);
    return Array.from(new Set(list));
  }, [report.tableRows]);

  function updatePegel(i: number, patch: Partial<PegelAusbauRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.pegelAusbauRows) && p.pegelAusbauRows.length ? [...p.pegelAusbauRows] : [emptyPegelAusbauRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, pegelAusbauRows: rows };
    });
  }

  const getPegelRohrValues = useCallback((row: PegelAusbauRow, art: PegelRohrArt) => {
    if (art === "sumpfrohr") {
      return { von: String(row.sumpfVon ?? ""), bis: String(row.sumpfBis ?? "") };
    }
    if (art === "aufsatz_pvc") {
      return { von: String(row.aufsatzPvcVon ?? ""), bis: String(row.aufsatzPvcBis ?? "") };
    }
    if (art === "aufsatz_stahl") {
      return { von: String(row.aufsatzStahlVon ?? ""), bis: String(row.aufsatzStahlBis ?? "") };
    }
    return { von: String(row.filterVon ?? ""), bis: String(row.filterBis ?? "") };
  }, []);

  const buildPegelRohrPatch = useCallback((art: PegelRohrArt, von: string, bis: string): Partial<PegelAusbauRow> => {
    if (art === "sumpfrohr") return { sumpfVon: von, sumpfBis: bis };
    if (art === "aufsatz_pvc") return { aufsatzPvcVon: von, aufsatzPvcBis: bis };
    if (art === "aufsatz_stahl") return { aufsatzStahlVon: von, aufsatzStahlBis: bis };
    return { filterVon: von, filterBis: bis };
  }, []);

  const getInitialRohrTypesForPegelRow = useCallback((row: PegelAusbauRow): PegelRohrArt[] => {
    const active = PEGEL_ROHRART_OPTIONS
      .map((opt) => opt.value)
      .filter((art) => {
        const values = getPegelRohrValues(row, art);
        return Boolean(values.von.trim() || values.bis.trim());
      });
    return active.length ? active : ["filter"];
  }, [getPegelRohrValues]);

  useEffect(() => {
    const rowCount = safePegel.length;
    if (pegelRohrInitCountRef.current === rowCount) return;
    pegelRohrInitCountRef.current = rowCount;
    setPegelRohrTypesByRow(() => {
      const next: Record<number, PegelRohrArt[]> = {};
      safePegel.forEach((row, idx) => {
        next[idx] = getInitialRohrTypesForPegelRow(row);
      });
      return next;
    });
  }, [safePegel, getInitialRohrTypesForPegelRow]);

  const getRohrTypesForRow = useCallback(
    (rowIndex: number, row: PegelAusbauRow) => pegelRohrTypesByRow[rowIndex] ?? getInitialRohrTypesForPegelRow(row),
    [pegelRohrTypesByRow, getInitialRohrTypesForPegelRow]
  );

  const getPegelVerfuellungValues = useCallback((row: PegelAusbauRow, art: PegelVerfuellungArt) => {
    if (art === "ton") {
      return { von: String(row.tonVon ?? ""), bis: String(row.tonBis ?? ""), value: "" };
    }
    if (art === "sand") {
      return { von: String(row.sandVon ?? ""), bis: String(row.sandBis ?? ""), value: "" };
    }
    if (art === "zement") {
      return { von: String(row.zementBentVon ?? ""), bis: String(row.zementBentBis ?? ""), value: "" };
    }
    if (art === "bohrgut") {
      return { von: String(row.bohrgutVon ?? ""), bis: String(row.bohrgutBis ?? ""), value: "" };
    }
    if (art === "filterkies") {
      return { von: String(row.filterkiesVon ?? ""), bis: String(row.filterkiesBis ?? ""), value: "" };
    }
    return { von: "", bis: "", value: "" };
  }, []);

  const buildPegelVerfuellungPatch = useCallback(
    (art: PegelVerfuellungArt, payload: { von?: string; bis?: string; value?: string }): Partial<PegelAusbauRow> => {
      if (art === "ton") return { tonVon: payload.von ?? "", tonBis: payload.bis ?? "" };
      if (art === "sand") return { sandVon: payload.von ?? "", sandBis: payload.bis ?? "" };
      if (art === "zement") return { zementBentVon: payload.von ?? "", zementBentBis: payload.bis ?? "" };
      if (art === "bohrgut") return { bohrgutVon: payload.von ?? "", bohrgutBis: payload.bis ?? "" };
      if (art === "filterkies") return { filterkiesVon: payload.von ?? "", filterkiesBis: payload.bis ?? "" };
      return {};
    },
    []
  );

  const getInitialVerfuellungTypesForPegelRow = useCallback(
    (row: PegelAusbauRow): PegelVerfuellungArt[] => {
      const active = PEGEL_VERFUELLUNG_OPTIONS
        .map((opt) => opt.value)
        .filter((art) => {
          const values = getPegelVerfuellungValues(row, art);
          return Boolean(values.von.trim() || values.bis.trim());
        });
      return active.length ? active : ["ton"];
    },
    [getPegelVerfuellungValues]
  );

  useEffect(() => {
    const rowCount = safePegel.length;
    if (pegelVerfuellungInitCountRef.current === rowCount) return;
    pegelVerfuellungInitCountRef.current = rowCount;
    setPegelVerfuellungTypesByRow(() => {
      const next: Record<number, PegelVerfuellungArt[]> = {};
      safePegel.forEach((row, idx) => {
        next[idx] = getInitialVerfuellungTypesForPegelRow(row);
      });
      return next;
    });
  }, [safePegel, getInitialVerfuellungTypesForPegelRow]);

  const getVerfuellungTypesForRow = useCallback(
    (rowIndex: number, row: PegelAusbauRow) =>
      pegelVerfuellungTypesByRow[rowIndex] ?? getInitialVerfuellungTypesForPegelRow(row),
    [pegelVerfuellungTypesByRow, getInitialVerfuellungTypesForPegelRow]
  );

  const rmlPegelDmValue = useMemo(
    () => safePegel.find((row) => String(row.pegelDm ?? "").trim().length > 0)?.pegelDm ?? "",
    [safePegel]
  );

  function setPegelDmForAllRows(nextDm: string) {
    setReport((p) => {
      const rows = Array.isArray(p.pegelAusbauRows) && p.pegelAusbauRows.length ? [...p.pegelAusbauRows] : [emptyPegelAusbauRow()];
      const nextRows = rows.map((row) => ({ ...row, pegelDm: nextDm }));
      return { ...p, pegelAusbauRows: nextRows };
    });
  }

  const parseBgChecks = useCallback((raw: unknown): string[] => {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    if (text.includes("|")) {
      return text
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const parts = text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const next = new Set(parts);
    if (next.has("Bolzen") && next.has("Lager")) {
      next.delete("Bolzen");
      next.delete("Lager");
      next.add("Bolzen, Lager");
    }
    return Array.from(next);
  }, []);

  const rmlBgCheckSet = useMemo(
    () => new Set(parseBgChecks(report.taeglicheUeberpruefungBg)),
    [parseBgChecks, report.taeglicheUeberpruefungBg]
  );

  const toggleRmlBgCheck = (item: string, checked: boolean) => {
    const next = new Set(rmlBgCheckSet);
    if (checked) {
      next.add(item);
    } else {
      next.delete(item);
    }
    update("taeglicheUeberpruefungBg", Array.from(next).join(BG_CHECK_DELIMITER));
  };

  function addPegelRow() {
    setReport((p) => {
      const rows = Array.isArray(p.pegelAusbauRows) && p.pegelAusbauRows.length ? [...p.pegelAusbauRows] : [];
      if (rows.length >= MAX_PEGEL_ROWS) return { ...p, pegelAusbauRows: rows.length ? rows : [emptyPegelAusbauRow()] };
      const nextRow = emptyPegelAusbauRow();
      if (!isRml && bohrNrOptions.length > 0) {
        const used = new Set(rows.map((row) => String(row.bohrNr ?? "").trim()).filter(Boolean));
        const nextBohrNr = bohrNrOptions.find((opt) => !used.has(opt)) ?? "";
        if (nextBohrNr) nextRow.bohrNr = nextBohrNr;
      }
      rows.push(nextRow);
      return { ...p, pegelAusbauRows: rows.length ? rows : [emptyPegelAusbauRow()] };
    });
  }

  function removeLastPegelRow() {
    setReport((p) => {
      const rows = Array.isArray(p.pegelAusbauRows) && p.pegelAusbauRows.length ? [...p.pegelAusbauRows] : [emptyPegelAusbauRow()];
      if (rows.length <= 1) return { ...p, pegelAusbauRows: rows };
      rows.pop();
      return { ...p, pegelAusbauRows: rows };
    });
  }

  type PegelBooleanKey =
    | "sebaKap"
    | "boKap"
    | "hydrKap"
    | "fernGask"
    | "passavant"
    | "betonSockel"
    | "blech"
    | "klarpump";

  const pegelBoolFields: Array<[PegelBooleanKey, string]> = [
    ["sebaKap", "Seba Kap."],
    ["boKap", "Bo Kap."],
    ["hydrKap", "Hydr. Kap."],
    ["fernGask", "Fern-Gask."],
    ["passavant", "Passavant"],
    ["betonSockel", "Betonsockel"],
    ["blech", "Blech"],
    ["klarpump", "Klarpump."],
  ];

  const showStep = (index: number) => !useStepper || stepIndex === index;
  const showHeaderBlock = !useStepper || (isRml ? stepIndex <= 2 : stepIndex <= 3);
  const headerGridClass = useStepper
    ? "grid gap-5 md:grid-cols-1"
    : "grid gap-5 md:grid-cols-2 xl:grid-cols-[1.35fr_1.35fr_1.2fr]";
  const rmlSelectedGeraete = useMemo(
    () =>
      new Set(
        String(report.vehicles ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      ),
    [report.vehicles]
  );

  return (
    <div className="mt-6 space-y-6 max-w-[2000px] mx-auto w-full overflow-x-hidden px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8 pb-16 text-slate-900 min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 rounded-3xl border border-slate-200/60 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]">
      {useStepper ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Schritt {stepIndex + 1} von {steps.length}
              </div>
              <div className="text-xl font-semibold text-slate-900">{steps[stepIndex]?.title}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  i === stepIndex
                    ? "bg-sky-50 text-sky-800 border-sky-200"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {i + 1}. {s.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(2,132,199,0.45)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-sky-900">Projekt auswählen</h3>
                <p className="mt-1 text-xs text-slate-500">Wähle Zielbereich oder erstelle direkt ein neues Projekt.</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                onClick={() => {
                  setSaveScope("my_reports");
                  setLocalProjectId(null);
                  setInitialProjectChoiceDone(true);
                  setProjectModalOpen(false);
                  pendingSaveResolveRef.current?.({ scope: "my_reports", projectId: null });
                  pendingSaveResolveRef.current = null;
                }}
              >
                Schließen
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div>
                <button
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
                  onClick={() => {
                    setSaveScope("my_reports");
                    setLocalProjectId(null);
                    setInitialProjectChoiceDone(true);
                    setProjectModalOpen(false);
                    pendingSaveResolveRef.current?.({ scope: "my_reports", projectId: null });
                    pendingSaveResolveRef.current = null;
                  }}
                >
                  <div className="font-medium">Meine Berichte</div>
                  <div className="text-xs text-slate-500">Speichert ohne Projekt-Zuordnung</div>
                </button>
              </div>

              <div className="mt-3 space-y-4">
                {/* 🔹 NEUES PROJEKT ANLEGEN */}
                <div className="rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/70 to-white p-3.5 sm:p-4">
                  <div className="text-sm font-semibold text-slate-800">Neues Projekt</div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-sky-300 focus:outline-none"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="z.B. Baustelle Freiburg Nord"
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-sky-200 bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      disabled={creatingProject}
                      onClick={createProject}
                    >
                      {creatingProject ? "Erstelle…" : "+ Anlegen"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    Legt das Projekt an und wählt es automatisch aus.
                  </p>
                </div>

                {/* 🔹 PROJEKT-LISTE */}
                {projectUiLoading ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Lade Projekte…</p>
                ) : projects.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Noch keine Projekte vorhanden.</p>
                ) : (
                  <div className="space-y-2">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
                        onClick={() => {
                          setSaveScope("project");
                          setLocalProjectId(p.id);
                          setInitialProjectChoiceDone(true);
                          void applyProjectPrefill(p.id, true);
                          setProjectModalOpen(false);
                          pendingSaveResolveRef.current?.({ scope: "project", projectId: p.id });
                          pendingSaveResolveRef.current = null;
                        }}
                      >
                        <div className="font-medium">
                          {String(p.project_number ?? "").trim()
                            ? `${String(p.project_number).trim()} - ${p.name}`
                            : p.name}
                        </div>
                        <div className="text-xs text-slate-500">{p.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* ======================= KOPF (PDF-LAYOUT) ======================= */}
      {showHeaderBlock ? (
        <GroupCard title={reportTitleLabel} badge="Kopfbereich">
          {(!useStepper || showStep(0)) ? null : null}
          <div className={headerGridClass}>
            {showStep(0) ? (
              <SubGroup title="Stammdaten">
                <div className="grid gap-3">
                  {reportType === "tagesbericht_rhein_main_link" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Datum</span>
                        <input
                          type="date"
                          className="w-full rounded-xl border p-3"
                          value={report.date ?? ""}
                          onChange={(e) => update("date", e.target.value)}
                          onFocus={(e) => openNativePicker(e.currentTarget)}
                          onClick={(e) => openNativePicker(e.currentTarget)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bohrgerät</span>
                        <select
                          className="w-full rounded-xl border p-3"
                          value={report.device ?? ""}
                          onChange={(e) => update("device", e.target.value)}
                        >
                          <option value="">Bitte wählen…</option>
                          {DEVICE_OPTIONS.map((device) => (
                            <option key={device} value={device}>
                              {device}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">PLZ</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={report.plz ?? ""}
                          onChange={(e) => update("plz", e.target.value)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Ort</span>
                        <div>
                          <input
                            className="w-full rounded-xl border p-3"
                            value={report.ort ?? ""}
                            onChange={(e) => {
                              update("ort", e.target.value);
                              if (e.target.value.trim().length < 2) setRmlOrtSuggestions([]);
                              triggerRmlOrtSearchDebounced(e.target.value);
                            }}
                            onBlur={(e) => {
                              const nextOrt = e.target.value;
                              setTimeout(() => {
                                void resolveRmlOrtOnBlur(nextOrt);
                              }, 120);
                            }}
                            placeholder="Ort suchen"
                            autoComplete="off"
                          />
                          {rmlOrtSuggestions.length > 0 ? (
                            <div className="mt-1 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                              {rmlOrtSuggestions.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0"
                                  onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    chooseRmlOrtSuggestion(s);
                                  }}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    </div>
                  ) : (
                    <>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Datum</span>
                        <div className="flex gap-2">
                          <input
                            type="date"
                            className="w-full rounded-xl border p-3"
                            value={report.date ?? ""}
                            onChange={(e) => update("date", e.target.value)}
                            onFocus={(e) => openNativePicker(e.currentTarget)}
                            onClick={(e) => openNativePicker(e.currentTarget)}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary shrink-0"
                            onClick={() => update("date", getTodayDateInputValue())}
                          >
                            Heute
                          </button>
                        </div>
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Projekt</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={report.project ?? ""}
                          onChange={(e) => update("project", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {reportType !== "tagesbericht_rhein_main_link" ? (
                    <label className="space-y-1">
                      <span className="text-sm text-slate-600">Auftragsnummer</span>
                      <input
                        className="w-full rounded-xl border p-3"
                        value={report.aNr ?? ""}
                        onChange={(e) => update("aNr", e.target.value)}
                      />
                    </label>
                  ) : null}
                  {reportType === "tagesbericht_rhein_main_link" ? null : (
                    <label className="space-y-1">
                      <span className="text-sm text-slate-600">Auftraggeber</span>
                      <input
                        className="w-full rounded-xl border p-3"
                        value={report.client ?? ""}
                        onChange={(e) => update("client", e.target.value)}
                      />
                    </label>
                  )}
                  {reportType === "tagesbericht_rhein_main_link" ? null : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bericht-Nr.</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={report.berichtNr ?? ""}
                          onChange={(e) => update("berichtNr", e.target.value)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bohrung-Nr.</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={report.bohrungNr ?? ""}
                          onChange={(e) => update("bohrungNr", e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </SubGroup>
            ) : null}

            {(showStep(1) || (!isRml && showStep(3))) ? (
              <SubGroup title={reportType === "tagesbericht_rhein_main_link" ? "Arbeitszeit / Wetter / Personal / Geräte" : "Fahrzeuge & Zeiten"}>
                {showStep(1) ? (
                  reportType === "tagesbericht_rhein_main_link" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bericht-Nr.</span>
                        <input className="w-full rounded-xl border p-3 bg-slate-50 text-slate-700" value={report.berichtNr ?? ""} readOnly />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bohrung-Nr.</span>
                        <input className="w-full rounded-xl border p-3" value={report.bohrungNr ?? ""} onChange={(e) => update("bohrungNr", e.target.value)} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Arbeitszeit von</span>
                        <TimePickerInput
                          className="w-full rounded-xl border p-3"
                          value={safeWorkTimes[0]?.from ?? ""}
                          onValueChange={(next) => setWorkTimeRow(0, { from: next })}
                          onOpenPicker={openNativePicker}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Arbeitszeit bis</span>
                        <TimePickerInput
                          className="w-full rounded-xl border p-3"
                          value={safeWorkTimes[0]?.to ?? ""}
                          onValueChange={(next) => setWorkTimeRow(0, { to: next })}
                          onOpenPicker={openNativePicker}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Pause von</span>
                        <TimePickerInput
                          className="w-full rounded-xl border p-3"
                          value={safeBreaks[0]?.from ?? ""}
                          onValueChange={(next) => setBreakRow(0, { from: next })}
                          onOpenPicker={openNativePicker}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Pause bis</span>
                        <TimePickerInput
                          className="w-full rounded-xl border p-3"
                          value={safeBreaks[0]?.to ?? ""}
                          onValueChange={(next) => setBreakRow(0, { to: next })}
                          onOpenPicker={openNativePicker}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Temp. Max (°C)</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={
                            typeof report.weather?.tempMaxC === "number" && Number.isFinite(report.weather?.tempMaxC)
                              ? String(report.weather?.tempMaxC)
                              : ""
                          }
                          onChange={(e) =>
                            setReport((p) => ({
                              ...p,
                              weather: {
                                ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                tempMaxC:
                                  e.target.value === "" || Number.isNaN(Number(e.target.value))
                                    ? null
                                    : Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Temp. Min (°C)</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={
                            typeof report.weather?.tempMinC === "number" && Number.isFinite(report.weather?.tempMinC)
                              ? String(report.weather?.tempMinC)
                              : ""
                          }
                          onChange={(e) =>
                            setReport((p) => ({
                              ...p,
                              weather: {
                                ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                tempMinC:
                                  e.target.value === "" || Number.isNaN(Number(e.target.value))
                                    ? null
                                    : Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <div className="space-y-2 md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-sm font-medium text-slate-700">Wetter</span>
                        <div className="flex flex-wrap gap-3">
                          {(["trocken", "regen", "frost"] as const).map((c) => (
                            <label key={c} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={(report.weather?.conditions ?? []).includes(c)}
                                onChange={(e) => {
                                  const cur = new Set(report.weather?.conditions ?? []);
                                  if (e.target.checked) cur.add(c);
                                  else cur.delete(c);
                                  setReport((p) => ({
                                    ...p,
                                    weather: {
                                      ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                      conditions: Array.from(cur),
                                    },
                                  }));
                                }}
                              />
                              <span>{c}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Bohrmeister</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={safeWorkTimes[0]?.name ?? report.workers?.[0]?.name ?? ""}
                          onChange={(e) => {
                            setTimeRowName(0, e.target.value);
                            setWorkerNameAt(0, e.target.value);
                          }}
                        />
                      </label>
                      <div className="space-y-2 md:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-700">Bohrhelfer</span>
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-secondary btn-xs" onClick={addBohrhelfer}>
                              + Helfer
                            </button>
                            <button type="button" className="btn btn-secondary btn-xs" onClick={removeBohrhelfer}>
                              - Helfer
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {bohrhelferNames.map((name, idx) => (
                            <select
                              key={idx}
                              className="w-full rounded-xl border p-3"
                              value={name}
                              onChange={(e) => setBohrhelferNameAt(idx, e.target.value)}
                            >
                              <option value="">{`Bohrhelfer ${idx + 1} wählen...`}</option>
                              {name && !isKnownRmlBohrhelferOption(name) ? (
                                <option value={name}>{name}</option>
                              ) : null}
                              {RML_BOHRHELFER_OPTIONS.map((helper) => (
                                <option key={helper} value={helper}>
                                  {helper}
                                </option>
                              ))}
                            </select>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2 md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-sm font-medium text-slate-700">Geräte</span>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {RML_GERAETE_OPTIONS.map((item) => (
                            <label key={item} className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={rmlSelectedGeraete.has(item)}
                                onChange={(e) => {
                                  const next = new Set(rmlSelectedGeraete);
                                  if (e.target.checked) next.add(item);
                                  else next.delete(item);
                                  const ordered = RML_GERAETE_OPTIONS.filter((opt) => next.has(opt));
                                  update("vehicles", ordered.join(", "));
                                }}
                              />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1 md:col-span-3">
                        <span className="text-sm text-slate-600">Fahrzeuge</span>
                        <input className="w-full rounded-xl border p-3" value={report.vehicles ?? ""} onChange={(e) => update("vehicles", e.target.value)} />
                      </label>
                      <label className="space-y-1 md:col-span-3">
                        <span className="text-sm text-slate-600">Gerät</span>
                        <select
                          className="w-full rounded-xl border p-3"
                          value={report.device ?? ""}
                          onChange={(e) => update("device", e.target.value)}
                        >
                          <option value="">Bitte wählen…</option>
                          {DEVICE_OPTIONS.map((device) => (
                            <option key={device} value={device}>
                              {device}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )
                ) : null}

                {showStep(3) && !isRml ? (
                  <div className="mt-4 min-w-0 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-medium">Arbeiter & Arbeitszeiten</h4>
                      <RowActions
                        addLabel="+ Arbeiter"
                        removeLabel="– Arbeiter"
                        onAdd={addWorker}
                        onRemove={removeLastWorker}
                        countLabel={`Arbeiter: ${safeWorkers.length}`}
                      />
                    </div>
                    <div className="mt-3 space-y-3">
                      {safeWorkers.map((worker, idx) => (
                        <div key={idx} className="grid gap-3 rounded-xl border border-slate-200/70 bg-white p-3 md:grid-cols-2">
                          <label className="min-w-0 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              {idx === 0 ? "Bohrmeister" : `Arbeiter ${idx + 1}`}
                            </span>
                            <input
                              className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                              value={worker.name ?? ""}
                              onChange={(e) => setWorkerNameAt(idx, e.target.value)}
                              placeholder={idx === 0 ? "Bohrmeister" : `Name Arbeiter ${idx + 1}`}
                            />
                          </label>
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Auslöse</span>
                            <div className="flex h-[42px] items-center gap-5 rounded-lg border px-3 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!worker.ausloeseT}
                                  onChange={(e) => setWorker(idx, { ausloeseT: e.target.checked })}
                                />
                                T
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!worker.ausloeseN}
                                  onChange={(e) => setWorker(idx, { ausloeseN: e.target.checked })}
                                />
                                N
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200/70 bg-white p-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!report.workCyclesSame}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setReport((p) => {
                              const workers = Array.isArray(p.workers) && p.workers.length ? p.workers : [emptyWorker()];
                              const currentWork = Array.isArray(p.workTimeRows) && p.workTimeRows.length ? [...p.workTimeRows] : [emptyTimeRow()];
                              const currentBreak = Array.isArray(p.breakRows) && p.breakRows.length ? [...p.breakRows] : [emptyTimeRow()];
                              const firstWork = currentWork[0] ?? emptyTimeRow();
                              const firstBreak = currentBreak[0] ?? emptyTimeRow();
                              const nextWorkRows = next
                                ? [
                                    {
                                      ...firstWork,
                                      name: String(workers[0]?.name ?? ""),
                                    },
                                  ]
                                : workers.map((w, idx) => ({
                                    ...(currentWork[idx] ?? firstWork ?? emptyTimeRow()),
                                    name: String(w?.name ?? ""),
                                  }));
                              const nextBreakRows = next
                                ? [
                                    {
                                      ...firstBreak,
                                      name: String(workers[0]?.name ?? ""),
                                    },
                                  ]
                                : workers.map((w, idx) => ({
                                    ...(currentBreak[idx] ?? firstBreak ?? emptyTimeRow()),
                                    name: String(w?.name ?? ""),
                                  }));
                              return {
                                ...p,
                                workCyclesSame: next,
                                workTimeRows: nextWorkRows,
                                breakRows: nextBreakRows,
                              };
                            });
                          }}
                        />
                        Sind die Arbeitstakte alle gleich?
                      </label>
                    </div>
                    <div className="mt-3 space-y-4">
                      {report.workCyclesSame ? (
                        (() => {
                          const work = safeWorkTimes[0] ?? emptyTimeRow();
                          const br = safeBreaks[0] ?? emptyTimeRow();
                          return (
                            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-3">
                              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Arbeitszeit von</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={work.from ?? ""}
                                    onChange={(e) => setWorkTimeRow(0, { from: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Arbeitszeit bis</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={work.to ?? ""}
                                    onChange={(e) => setWorkTimeRow(0, { to: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pause von</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={br.from ?? ""}
                                    onChange={(e) => setBreakRow(0, { from: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pause bis</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={br.to ?? ""}
                                    onChange={(e) => setBreakRow(0, { to: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        safeWorkers.map((worker, i) => {
                          const r = safeWorkTimes[i] ?? emptyTimeRow();
                          const b = safeBreaks[i] ?? emptyTimeRow();
                          return (
                            <div key={i} className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                {worker.name?.trim() || `Arbeiter ${i + 1}`}
                              </div>
                              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Arbeitszeit von</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={r.from ?? ""}
                                    onChange={(e) => setWorkTimeRow(i, { from: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Arbeitszeit bis</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={r.to ?? ""}
                                    onChange={(e) => setWorkTimeRow(i, { to: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pause von</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={b.from ?? ""}
                                    onChange={(e) => setBreakRow(i, { from: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                                <label className="min-w-0 space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pause bis</span>
                                  <input
                                    type="time"
                                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 text-sm"
                                    value={b.to ?? ""}
                                    onChange={(e) => setBreakRow(i, { to: e.target.value })}
                                    onFocus={(e) => openNativePicker(e.currentTarget)}
                                    onClick={(e) => openNativePicker(e.currentTarget)}
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </SubGroup>
            ) : null}

            {(showStep(2) && isRml) ? (
              <SubGroup title="Bohrdaten (Aufschluss / Krone / Tiefe)">
                <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-sm font-medium text-slate-700">Bohrrichtung</div>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {(["vertikal", "horizontal", "schräg"] as const).map((dir) => {
                        const checked =
                          dir === "schräg"
                            ? ["schräg", "schraeg"].includes(String(report.bohrrichtung ?? "").toLowerCase())
                            : String(report.bohrrichtung ?? "").toLowerCase() === dir;
                        return (
                          <label key={dir} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) update("bohrrichtung", dir);
                                else update("bohrrichtung", "");
                              }}
                            />
                            <span>{dir}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <RowActions
                    addLabel="+ Zeile"
                    removeLabel="– Zeile"
                    onAdd={addRow}
                    onRemove={removeLastRow}
                    countLabel={`Zeilen: ${safeTableRows.length} / ${MAX_TABLE_ROWS}`}
                    disableAdd={safeTableRows.length >= MAX_TABLE_ROWS}
                  />
                  <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <div className="col-span-4">Bohrverfahren / Bohrwerkzeug / Spülung</div>
                    <div className="col-span-2">Krone Ø (Bohr-Ø)</div>
                    <div className="col-span-6 grid grid-cols-2 gap-2">
                      <div className="col-span-2 text-center normal-case">Tiefe ab GOK in m</div>
                      <div className="col-span-2 h-px bg-slate-300/50" />
                      <div className="text-center normal-case">von</div>
                      <div className="text-center normal-case">bis</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {safeTableRows.map((row, i) => {
                      const aufschlussValue = (row.verrohrtFlags?.[0] ?? "") as VerrohrtFlag | "";
                      const allowedAufschlussKronen = getRmlAufschlussKronenOptions(aufschlussValue);
                      return (
                        <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                          <select
                            className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-4"
                            value={aufschlussValue}
                            onChange={(e) => {
                              const next = e.target.value as VerrohrtFlag | "";
                              const allowedKronen = getRmlAufschlussKronenOptions(next);
                              const currentKrone = String(row.boNr ?? "").trim();
                              const nextKrone = allowedKronen.includes(currentKrone)
                                ? currentKrone
                                : (allowedKronen[0] ?? "");
                              setRow(i, {
                                verrohrtFlags: next ? [next] : [],
                                boNr: nextKrone,
                              });
                            }}
                          >
                            <option value="">Bitte wählen...</option>
                            {RML_BOHRVERFAHREN_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <select
                            className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-2"
                            value={row.boNr ?? ""}
                            onChange={(e) => setRow(i, { boNr: e.target.value })}
                          >
                            <option value="">Bitte wählen…</option>
                            {allowedAufschlussKronen.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <input
                            className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-3"
                            value={row.gebohrtVon ?? ""}
                            onChange={(e) => setRow(i, { gebohrtVon: e.target.value })}
                            placeholder="von"
                          />
                          <input
                            className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-3"
                            value={row.gebohrtBis ?? ""}
                            onChange={(e) => setRow(i, { gebohrtBis: e.target.value })}
                            placeholder="bis"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SubGroup>
            ) : null}

            {(!isRml && (showStep(1) || showStep(2))) ? (
              <SubGroup title={isRml ? "Wetter / Entfernung" : "Wetter / Transport / Entfernung"}>
                {showStep(2) && !isRml ? (
                  <div className="rounded-xl border border-slate-200/70 p-3 bg-slate-50/60">
                    <h3 className="font-medium">Wetter</h3>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {(["trocken", "regen", "frost"] as const).map((c) => (
                        <label key={c} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(report.weather?.conditions ?? []).includes(c)}
                            onChange={(e) => {
                              const cur = new Set(report.weather?.conditions ?? []);
                              if (e.target.checked) cur.add(c);
                              else cur.delete(c);
                              setReport((p) => ({
                                ...p,
                                weather: {
                                  ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                  conditions: Array.from(cur),
                                },
                              }));
                            }}
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Temp. Max (°C)</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={
                            typeof report.weather?.tempMaxC === "number" && Number.isFinite(report.weather?.tempMaxC)
                              ? String(report.weather?.tempMaxC)
                              : ""
                          }
                          onChange={(e) =>
                            setReport((p) => ({
                              ...p,
                              weather: {
                                ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                tempMaxC:
                                  e.target.value === "" || Number.isNaN(Number(e.target.value))
                                    ? null
                                    : Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-sm text-slate-600">Temp. Min (°C)</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={
                            typeof report.weather?.tempMinC === "number" && Number.isFinite(report.weather?.tempMinC)
                              ? String(report.weather?.tempMinC)
                              : ""
                          }
                          onChange={(e) =>
                            setReport((p) => ({
                              ...p,
                              weather: {
                                ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                                tempMinC:
                                  e.target.value === "" || Number.isNaN(Number(e.target.value))
                                    ? null
                                    : Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {showStep(1) && !isRml ? (
                  <div className="rounded-xl border border-slate-200/70 p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Transport</h3>
                      <RowActions
                        addLabel="+ Transport"
                        removeLabel="– Transport"
                        onAdd={addTransportRow}
                        onRemove={removeLastTransportRow}
                        countLabel={`Transporte: ${safeTransport.length} / ${MAX_TRANSPORT_ROWS}`}
                        disableAdd={safeTransport.length >= MAX_TRANSPORT_ROWS}
                      />
                    </div>
                    <div className="mt-3 space-y-3">
                      {safeTransport.map((r, i) => (
                        <div key={i} className="grid gap-3 md:grid-cols-12">
                          <div className="md:col-span-4 space-y-2">
                            <input
                              className="rounded-xl border p-3 w-full"
                              value={r.from ?? ""}
                              onChange={(e) => setTransportLocationText(i, "from", e.target.value)}
                              placeholder="von (Ort suchen)"
                            />
                            {(transportSuggestions[transportFieldKey(i, "from")] ?? []).length > 0 ? (
                              <div className="rounded-lg border border-slate-200 bg-white p-1">
                                {(transportSuggestions[transportFieldKey(i, "from")] ?? []).map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                                    onClick={() => chooseTransportSuggestion(i, "from", s)}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="md:col-span-4 space-y-2">
                            <input
                              className="rounded-xl border p-3 w-full"
                              value={r.to ?? ""}
                              onChange={(e) => setTransportLocationText(i, "to", e.target.value)}
                              placeholder="nach (Ort suchen)"
                            />
                            {(transportSuggestions[transportFieldKey(i, "to")] ?? []).length > 0 ? (
                              <div className="rounded-lg border border-slate-200 bg-white p-1">
                                {(transportSuggestions[transportFieldKey(i, "to")] ?? []).map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                                    onClick={() => chooseTransportSuggestion(i, "to", s)}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <input
                            className="rounded-xl border p-3 md:col-span-2"
                            value={typeof r.km === "number" && Number.isFinite(r.km) ? String(r.km) : ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                setTransportRow(i, { km: null });
                                return;
                              }
                              const parsed = Number(raw.replace(",", "."));
                              setTransportRow(i, { km: Number.isFinite(parsed) ? parsed : null });
                            }}
                            placeholder="Entfernung (km)"
                          />
                          <input className="rounded-xl border p-3 md:col-span-2" value={r.time ?? ""} onChange={(e) => setTransportRow(i, { time: e.target.value })} placeholder="Zeit (hh:mm)" />
                          <div className="md:col-span-12 flex justify-end">
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => updateTransportRoute(i)}
                              disabled={Boolean(transportRouteLoading[i])}
                            >
                              {transportRouteLoading[i] ? "Berechne…" : "Entfernung/Zeit berechnen"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showStep(2) ? (
                  <div className="rounded-xl border border-slate-200/70 p-3 bg-white">
                    <h3 className="font-medium">Ruhewasser vor Arbeitsbeginn / Entfernung Wohnwagen/Baustelle</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="min-h-[32px] text-sm leading-4 text-slate-600">Ruhewasser vor Arbeitsbeginn (m) GOK</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={report.ruhewasserVorArbeitsbeginnM ?? ""}
                          onChange={(e) =>
                            update(
                              "ruhewasserVorArbeitsbeginnM",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="min-h-[32px] text-sm leading-4 text-slate-600">Entfernung Wohnwagen/Baustelle (km)</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          inputMode="numeric"
                          value={report.entfernungWohnwagenBaustelleKm ?? ""}
                          onChange={(e) =>
                            update(
                              "entfernungWohnwagenBaustelleKm",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="min-h-[32px] text-sm leading-4 text-slate-600">Zeit</span>
                        <input
                          className="w-full rounded-xl border p-3"
                          value={report.entfernungWohnwagenBaustelleZeit ?? ""}
                          onChange={(e) =>
                            update("entfernungWohnwagenBaustelleZeit", e.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </SubGroup>
            ) : null}
          </div>
        </GroupCard>
      ) : null}

      {showStep(3) && isRml ? (
        <GroupCard title="Wasserspiegel / Verrohrung ab GOK" badge="RML">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
              <RowActions
                addLabel="+ Zeile"
                removeLabel="– Zeile"
                onAdd={addWaterLevelRow}
                onRemove={removeLastWaterLevelRow}
                countLabel={`Wasserspiegel: ${safeWaterLevelRows.length} / ${MAX_WATER_LEVEL_ROWS}`}
                disableAdd={safeWaterLevelRows.length >= MAX_WATER_LEVEL_ROWS}
              />
              <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <div className="col-span-7">Uhr</div>
                <div className="col-span-5 normal-case">Stand in Metern (m)</div>
              </div>
              <div className="space-y-2">
                {safeWaterLevelRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                    <select
                      className="col-span-7 rounded-lg border px-3 py-2 text-sm"
                      value={row.time ?? ""}
                      onChange={(e) => setWaterLevelRow(i, { time: e.target.value })}
                    >
                      <option value="">Bitte wählen...</option>
                      {rmlWaterTimeOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <input
                      className="col-span-5 rounded-lg border px-3 py-2 text-sm"
                      value={row.meters ?? ""}
                      onChange={(e) => setWaterLevelRow(i, { meters: e.target.value })}
                      placeholder="m"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
              <RowActions
                addLabel="+ Zeile"
                removeLabel="– Zeile"
                onAdd={addVerrohrungRow}
                onRemove={removeLastVerrohrungRow}
                countLabel={`Verrohrung: ${safeVerrohrungRows.length} / ${MAX_VERROHRUNG_ROWS}`}
                disableAdd={safeVerrohrungRows.length >= MAX_VERROHRUNG_ROWS}
              />
              <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <div className="col-span-7">Ø</div>
                <div className="col-span-5 normal-case">Länge in Metern (m)</div>
              </div>
              <div className="space-y-2">
                {safeVerrohrungRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                    <select
                      className="col-span-7 rounded-lg border px-3 py-2 text-sm"
                      value={row.diameter ?? ""}
                      onChange={(e) => setVerrohrungRow(i, { diameter: e.target.value })}
                    >
                      <option value="">Bitte wählen...</option>
                      {RML_KRONE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <input
                      className="col-span-5 rounded-lg border px-3 py-2 text-sm"
                      value={row.meters ?? ""}
                      onChange={(e) => setVerrohrungRow(i, { meters: e.target.value })}
                      placeholder="m"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GroupCard>
      ) : null}

      {showStep(4) && isRml ? (
        <GroupCard title="Beschreibung der Tätigkeiten" badge="Leistungsbericht">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-slate-500">Freitextfeld</div>
              <DictationButton
                onClick={() => startDictationForTarget("rml-step4-taetigkeiten")}
                active={activeDictationTarget === "rml-step4-taetigkeiten"}
              />
            </div>
            <textarea
              ref={(el) => {
                dictationTargetsRef.current["rml-step4-taetigkeiten"] = el;
              }}
              className="mt-3 w-full rounded-xl border p-3 min-h-[320px]"
              value={report.otherWork ?? ""}
              onChange={(e) => update("otherWork", e.target.value)}
              placeholder="Tätigkeiten, Ablauf, Besonderheiten…"
            />
          </div>
        </GroupCard>
      ) : null}

      {showStep(5) && isRml ? (
        <GroupCard title="Ausbau" badge="RML">
          <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
            <div className="space-y-1">
              <label className="block text-sm text-slate-600">Ausbaudurchmesser Ø</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 md:max-w-md"
                value={rmlPegelDmValue}
                onChange={(e) => setPegelDmForAllRows(e.target.value)}
              >
                <option value="">Bitte wählen...</option>
                {PEGEL_DM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <RowActions
              addLabel="+ Zeile"
              removeLabel="– Zeile"
              onAdd={addPegelRow}
              onRemove={removeLastPegelRow}
              countLabel={`Zeilen: ${safePegel.length} / ${MAX_PEGEL_ROWS}`}
              disableAdd={safePegel.length >= MAX_PEGEL_ROWS}
            />
            <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <div className="col-span-12 md:col-span-4">Ausbau-Art</div>
              <div className="col-span-12 md:col-span-4 normal-case">von (m)</div>
              <div className="col-span-12 md:col-span-4 normal-case">bis (m)</div>
            </div>
            <div className="space-y-2">
              {safePegel.map((row, i) => {
                const derivedAusbauArt: "filter" | "vollrohr" | "stahlaufsatz" | "individuell" =
                  row.aufsatzStahlVon || row.aufsatzStahlBis
                    ? "stahlaufsatz"
                    : row.rohrePvcVon || row.rohrePvcBis
                      ? "vollrohr"
                      : String(row.ausbauArtCustom ?? "").trim()
                        ? "individuell"
                      : "filter";
                const explicitAusbauArt = row.ausbauArtType;
                const ausbauArt: "filter" | "vollrohr" | "stahlaufsatz" | "individuell" =
                  explicitAusbauArt === "filter" ||
                  explicitAusbauArt === "vollrohr" ||
                  explicitAusbauArt === "stahlaufsatz" ||
                  explicitAusbauArt === "individuell"
                    ? explicitAusbauArt
                    : derivedAusbauArt;
                const fromValue =
                  ausbauArt === "stahlaufsatz"
                    ? row.aufsatzStahlVon ?? ""
                    : ausbauArt === "vollrohr"
                      ? row.rohrePvcVon ?? ""
                      : row.filterVon ?? "";
                const toValue =
                  ausbauArt === "stahlaufsatz"
                    ? row.aufsatzStahlBis ?? ""
                    : ausbauArt === "vollrohr"
                      ? row.rohrePvcBis ?? ""
                      : row.filterBis ?? "";

                return (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                    <select
                      className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-4"
                      value={ausbauArt}
                      onChange={(e) => {
                        const nextArt = e.target.value as "filter" | "vollrohr" | "stahlaufsatz" | "individuell";
                        if (nextArt === "stahlaufsatz") {
                          updatePegel(i, {
                            ausbauArtType: "stahlaufsatz",
                            filterVon: "",
                            filterBis: "",
                            rohrePvcVon: "",
                            rohrePvcBis: "",
                            aufsatzStahlVon: fromValue,
                            aufsatzStahlBis: toValue,
                          });
                          return;
                        }
                        if (nextArt === "vollrohr") {
                          updatePegel(i, {
                            ausbauArtType: "vollrohr",
                            filterVon: "",
                            filterBis: "",
                            rohrePvcVon: fromValue,
                            rohrePvcBis: toValue,
                            aufsatzStahlVon: "",
                            aufsatzStahlBis: "",
                          });
                          return;
                        }
                        if (nextArt === "individuell") {
                          updatePegel(i, {
                            ausbauArtType: "individuell",
                            filterVon: fromValue,
                            filterBis: toValue,
                            rohrePvcVon: "",
                            rohrePvcBis: "",
                            aufsatzStahlVon: "",
                            aufsatzStahlBis: "",
                            ausbauArtCustom: row.ausbauArtCustom ?? "",
                          });
                          return;
                        }
                        updatePegel(i, {
                          ausbauArtType: "filter",
                          filterVon: fromValue,
                          filterBis: toValue,
                          rohrePvcVon: "",
                          rohrePvcBis: "",
                          aufsatzStahlVon: "",
                          aufsatzStahlBis: "",
                        });
                      }}
                    >
                      <option value="filter">Filter</option>
                      <option value="vollrohr">Vollrohr</option>
                      <option value="stahlaufsatz">Stahlaufsatz</option>
                      <option value="individuell">Individuell</option>
                    </select>
                    <input
                      className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-4"
                      value={fromValue}
                      onChange={(e) => {
                        const nextFrom = e.target.value;
                        if (ausbauArt === "stahlaufsatz") {
                          updatePegel(i, { aufsatzStahlVon: nextFrom });
                          return;
                        }
                        if (ausbauArt === "vollrohr") {
                          updatePegel(i, { rohrePvcVon: nextFrom });
                          return;
                        }
                        updatePegel(i, { filterVon: nextFrom });
                      }}
                      placeholder="von"
                    />
                    <input
                      className="col-span-12 rounded-lg border px-3 py-2 text-sm md:col-span-4"
                      value={toValue}
                      onChange={(e) => {
                        const nextTo = e.target.value;
                        if (ausbauArt === "stahlaufsatz") {
                          updatePegel(i, { aufsatzStahlBis: nextTo });
                          return;
                        }
                        if (ausbauArt === "vollrohr") {
                          updatePegel(i, { rohrePvcBis: nextTo });
                          return;
                        }
                        updatePegel(i, { filterBis: nextTo });
                      }}
                      placeholder="bis"
                    />
                    {ausbauArt === "individuell" ? (
                      <input
                        className="col-span-12 rounded-lg border px-3 py-2 text-sm"
                        value={row.ausbauArtCustom ?? ""}
                        onChange={(e) => updatePegel(i, { ausbauArtCustom: e.target.value, ausbauArtType: "individuell" })}
                        placeholder="Individuelle Ausbau-Art"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </GroupCard>
      ) : null}

      {showStep(6) && isRml ? (
        <GroupCard title="Verfüllung" badge="RML">
          <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
            <RowActions
              addLabel="+ Zeile"
              removeLabel="– Zeile"
              onAdd={addPegelRow}
              onRemove={removeLastPegelRow}
              countLabel={`Zeilen: ${safePegel.length} / ${MAX_PEGEL_ROWS}`}
              disableAdd={safePegel.length >= MAX_PEGEL_ROWS}
            />
            <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <div className="col-span-4 normal-case">Verfüllung von (m)</div>
              <div className="col-span-4 normal-case">Verfüllung bis (m)</div>
              <div className="col-span-4">Material</div>
            </div>
            <div className="space-y-2">
              {safePegel.map((row, i) => {
                const material = String(row.filterkiesKoernung ?? "");
                const isKnownMaterial = RML_VERFUELLUNG_OPTIONS.includes(material as (typeof RML_VERFUELLUNG_OPTIONS)[number]);
                const isCustom = material.length > 0 && !isKnownMaterial;
                const materialSelectValue = isCustom ? "Individuell" : material;
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <input
                      className="col-span-12 rounded-xl border px-3 py-3 text-base md:col-span-4"
                      value={row.tonVon ?? ""}
                      onChange={(e) => updatePegel(i, { tonVon: e.target.value })}
                      placeholder="von"
                    />
                    <input
                      className="col-span-12 rounded-xl border px-3 py-3 text-base md:col-span-4"
                      value={row.tonBis ?? ""}
                      onChange={(e) => updatePegel(i, { tonBis: e.target.value })}
                      placeholder="bis"
                    />
                    <div className="col-span-12 space-y-2 md:col-span-4">
                      <select
                        className="w-full rounded-xl border px-3 py-3 text-base"
                        value={materialSelectValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === "Individuell") {
                            updatePegel(i, { filterkiesKoernung: "Individuell" });
                          } else {
                            updatePegel(i, { filterkiesKoernung: next });
                          }
                        }}
                      >
                        <option value="">Bitte wählen...</option>
                        {RML_VERFUELLUNG_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      {materialSelectValue === "Individuell" ? (
                        <input
                          className="w-full rounded-xl border px-3 py-3 text-base"
                          value={isCustom ? material : ""}
                          onChange={(e) => updatePegel(i, { filterkiesKoernung: e.target.value })}
                          placeholder="Individuelles Material"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </GroupCard>
      ) : null}

      {showStep(7) && isRml ? (
        <GroupCard title="SPT-Versuche" badge="RML">
          <div className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
            <RowActions
              addLabel="+ Zeile"
              removeLabel="– Zeile"
              onAdd={addRow}
              onRemove={removeLastRow}
              countLabel={`Zeilen: ${safeTableRows.length} / ${MAX_TABLE_ROWS}`}
              disableAdd={safeTableRows.length >= MAX_TABLE_ROWS}
            />
            <div className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <div className="col-span-2 normal-case">von (m)</div>
              <div className="col-span-2 normal-case">bis (m)</div>
              <div className="col-span-2">0-15 cm</div>
              <div className="col-span-3">15-30 cm</div>
              <div className="col-span-3">30-45 cm</div>
            </div>
            <div className="space-y-2">
              {safeTableRows.map((row, i) => {
                const [s1, s2, s3] = getSptParts(row.spt);
                const stopAfter1 = normalizeSptSchlagInput(s1) === String(SPT_MAX_SCHLAEGE);
                const stopAfter2 = normalizeSptSchlagInput(s2) === String(SPT_MAX_SCHLAEGE);
                const showSecond = !stopAfter1;
                const showThird = !stopAfter1 && !stopAfter2;
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2">
                    <input
                      className="col-span-6 rounded-lg border px-3 py-2 text-sm md:col-span-2"
                      value={row.gebohrtVon ?? ""}
                      onChange={(e) => {
                        const nextVon = e.target.value;
                        const bis = getSptBisFromVon(i, nextVon, s1, s2, s3);
                        setRow(i, { gebohrtVon: nextVon, gebohrtBis: bis });
                      }}
                      placeholder="von"
                    />
                    <input
                      className="col-span-6 rounded-lg border bg-slate-50 px-3 py-2 text-sm md:col-span-2"
                      value={row.gebohrtBis ?? ""}
                      readOnly
                      placeholder="bis"
                    />
                    <input
                      className="col-span-4 rounded-lg border px-3 py-2 text-sm md:col-span-2"
                      value={s1}
                      onChange={(e) => setSptPart(i, 0, e.target.value)}
                      placeholder="0-15"
                    />
                    {showSecond ? (
                      <input
                        className="col-span-4 rounded-lg border px-3 py-2 text-sm md:col-span-3"
                        value={s2}
                        onChange={(e) => setSptPart(i, 1, e.target.value)}
                        placeholder="15-30"
                      />
                    ) : (
                      <input className="col-span-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm md:col-span-3" value="-" readOnly />
                    )}
                    {showThird ? (
                      <input
                        className="col-span-4 rounded-lg border px-3 py-2 text-sm md:col-span-3"
                        value={s3}
                        onChange={(e) => setSptPart(i, 2, e.target.value)}
                        placeholder="30-45"
                      />
                    ) : (
                      <input className="col-span-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm md:col-span-3" value="-" readOnly />
                    )}
                    {normalizeSptSchlagInput(s1) === String(SPT_MAX_SCHLAEGE) ? (
                      <label className="col-span-12 text-xs text-slate-600 md:col-span-4">
                        cm bei 50 (0-15)
                        <input
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
                          value={rmlSptCmOverrides[sptCmOverrideKey(i, 0)] ?? ""}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const nextOverrides = {
                              ...rmlSptCmOverrides,
                              [sptCmOverrideKey(i, 0)]: nextValue,
                            };
                            setRmlSptCmOverrides(nextOverrides);
                            const bis = getSptBisFromVon(i, String(row.gebohrtVon ?? ""), s1, s2, s3, nextOverrides);
                            setRow(i, { gebohrtBis: bis });
                          }}
                          placeholder="cm"
                        />
                      </label>
                    ) : null}
                    {showSecond && normalizeSptSchlagInput(s2) === String(SPT_MAX_SCHLAEGE) ? (
                      <label className="col-span-12 text-xs text-slate-600 md:col-span-4">
                        cm bei 50 (15-30)
                        <input
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
                          value={rmlSptCmOverrides[sptCmOverrideKey(i, 1)] ?? ""}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const nextOverrides = {
                              ...rmlSptCmOverrides,
                              [sptCmOverrideKey(i, 1)]: nextValue,
                            };
                            setRmlSptCmOverrides(nextOverrides);
                            const bis = getSptBisFromVon(i, String(row.gebohrtVon ?? ""), s1, s2, s3, nextOverrides);
                            setRow(i, { gebohrtBis: bis });
                          }}
                          placeholder="cm"
                        />
                      </label>
                    ) : null}
                    {showThird && normalizeSptSchlagInput(s3) === String(SPT_MAX_SCHLAEGE) ? (
                      <label className="col-span-12 text-xs text-slate-600 md:col-span-4">
                        cm bei 50 (30-45)
                        <input
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
                          value={rmlSptCmOverrides[sptCmOverrideKey(i, 2)] ?? ""}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const nextOverrides = {
                              ...rmlSptCmOverrides,
                              [sptCmOverrideKey(i, 2)]: nextValue,
                            };
                            setRmlSptCmOverrides(nextOverrides);
                            const bis = getSptBisFromVon(i, String(row.gebohrtVon ?? ""), s1, s2, s3, nextOverrides);
                            setRow(i, { gebohrtBis: bis });
                          }}
                          placeholder="cm"
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </GroupCard>
      ) : null}

      {/* ======================= ARBEITER (TABELLENLAYOUT) ======================= */}
      {!isRml && showStep(4) ? <GroupCard title="Arbeitstakte / Stunden" badge="Personal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Arbeiter werden in Schritt 4 gepflegt.
          </div>
          <div className="flex items-center gap-2">
            {report.workCyclesSame ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Arbeitstakte</span>
                <button
                  type="button"
                  className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                  onClick={() =>
                    setReport((p) => {
                      const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                      if (list.length >= 22) return p;
                      list.push("");
                      return { ...p, workCycles: list };
                    })
                  }
                  disabled={(Array.isArray(report.workCycles) ? report.workCycles : []).length >= 22}
                >
                  + Takt
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                  onClick={() =>
                    setReport((p) => {
                      const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                      if (list.length <= 1) return { ...p, workCycles: list };
                      list.pop();
                      return { ...p, workCycles: list };
                    })
                  }
                  disabled={(Array.isArray(report.workCycles) ? report.workCycles : []).length <= 1}
                >
                  – Takt
                </button>
              </>
            ) : null}
          </div>
        </div>

        {report.workCyclesSame ? (
          <div className="mt-4 rounded-xl border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Arbeitstakte (für alle)</div>
              <div
                className={`rounded-xl border px-5 py-2 text-sm font-semibold ${
                  sharedHoursMatch
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-rose-300 bg-rose-50 text-rose-700"
                }`}
              >
                Soll: {sharedExpectedHours || "—"} Std. | Ist: {sharedTotalHours || "—"} Std.
              </div>
            </div>
            <div className="space-y-2">
              {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((val, i) => (
                <div key={i} className="rounded-lg border border-slate-200/70 p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Takt {i + 1}</div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                    <select
                      className="w-full rounded border px-2 py-2 text-sm"
                      value={val ?? ""}
                      onChange={(e) => {
                        const next = e.target.value;
                        setReport((p) => {
                          const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                          list[i] = next;
                          return { ...p, workCycles: list };
                        });
                        if (next !== "__custom__") {
                          setCustomCycleDraft((p) => ({ ...p, [`shared-${i}`]: "" }));
                        }
                      }}
                    >
                      <option value="">Bitte wählen…</option>
                      <option value="Transport">1 Transport</option>
                      <option value="Einrichten und Aufstellen">2 Einrichten und Aufstellen</option>
                      <option value="Umsetzen">3 Umsetzen</option>
                      <option value="Rammbohren/EK-bohren">4 Rammbohren/EK-bohren</option>
                      <option value="Kernbohren">5 Kernbohren</option>
                      <option value="Vollbohren">6 Vollbohren</option>
                      <option value="Hindernisse durchbohren">7 Hindernisse durchbohren</option>
                      <option value="Schachten">8 Schachten</option>
                      <option value="Proben/Bohrung aufnehmen">9 Proben/Bohrung aufnehmen</option>
                      <option value="Bo. aufnehmen m. GA">10 Bo. aufnehmen m. GA</option>
                      <option value="Pumpversuche">11 Pumpversuche</option>
                      <option value="Bohrloch Versuche">12 Bohrloch Versuche</option>
                      <option value="Bohrloch Verfüllung">13 Bohrloch Verfüllung</option>
                      <option value="Pegel:einbau mit Verfüllung">14 Pegel:einbau mit Verfüllung</option>
                      <option value="Fahrten">15 Fahrten</option>
                      <option value="Bohrstelle räumen, Flurschäden beseitigen">16 Bohrstelle räumen, Flurschäden beseitigen</option>
                      <option value="Baustelle räumen">17 Baustelle räumen</option>
                      <option value="Werkstatt/Laden">18 Werkstatt/Laden</option>
                      <option value="Geräte-Pflege/Reparatur">19 Geräte-Pflege/Reparatur</option>
                      <option value="Kampfmittel">20 Kampfmittel</option>
                      <option value="Wasser fahren">21 Wasser fahren</option>
                      <option value="Platten legen">22 Platten legen</option>
                      {customWorkCycles.map((c, idx) => (
                        <option key={`custom-${c}`} value={c}>{23 + idx} {c}</option>
                      ))}
                      <option value="__custom__">Eigener Takt…</option>
                    </select>
                    <input
                      className={`w-full rounded border px-2 py-2 text-sm ${isQuarterInput(sharedStunden[i] ?? "") ? "" : "border-rose-400 bg-rose-50"}`}
                      value={sharedStunden[i] ?? ""}
                      onChange={(e) => {
                        const next = [...sharedStunden];
                        next[i] = e.target.value;
                        applySharedStunden(next);
                      }}
                      placeholder="Std."
                    />
                  </div>
                  {val === "__custom__" ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded border px-2 py-2 text-sm"
                        placeholder="Eigener Takt"
                        value={customCycleDraft[`shared-${i}`] ?? ""}
                        onChange={(e) =>
                          setCustomCycleDraft((p) => ({ ...p, [`shared-${i}`]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          const text = (customCycleDraft[`shared-${i}`] ?? "").trim();
                          if (!text) return;
                          setReport((p) => {
                            const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                            list[i] = text;
                            return { ...p, workCycles: list };
                          });
                          setCustomWorkCycles((prev) => {
                            const exists = prev.some((v) => v.toLowerCase() === text.toLowerCase());
                            if (exists) return prev;
                            if (prev.length >= MAX_CUSTOM_WORK_CYCLES) {
                              alert(`Maximal ${MAX_CUSTOM_WORK_CYCLES} eigene Arbeitstakte erlaubt.`);
                              return prev;
                            }
                            const next = [...prev, text];
                            void saveCustomWorkCycles(next);
                            return next;
                          });
                          setCustomCycleDraft((p) => ({ ...p, [`shared-${i}`]: "" }));
                        }}
                      >
                        Übernehmen
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!report.workCyclesSame ? (
          <div className="mt-4 space-y-4">
            {safeWorkers.map((w, idx) => {
              const taktStr = getTaktHoursStringForWorker(w);
              const timeStr = getTimeHoursStringForWorker(idx);
              const invalid = hasInvalidStunden(w);
              const matches = !invalid && Boolean(taktStr) && Boolean(timeStr) && areHourValuesEqual(taktStr, timeStr);
              const workerCycles = getWorkerCycles(w);
              return (
                <div key={idx} className="rounded-xl border p-4 space-y-4">
                  <div className="grid items-center gap-3 md:grid-cols-[minmax(180px,1fr)_280px_auto]">
                    <div className="text-sm font-semibold text-slate-800">
                      {w.name?.trim() ? w.name : `Arbeiter ${idx + 1}`}
                    </div>
                    <div
                      className={`rounded-xl border px-5 py-2 text-center text-sm font-semibold ${
                        matches
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-rose-300 bg-rose-50 text-rose-700"
                      }`}
                    >
                      Soll: {timeStr || "—"} Std. | Ist: {taktStr || "—"} Std.
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Arbeitstakte</span>
                      <button
                        type="button"
                        className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                        onClick={() => {
                          const next = [...workerCycles, ""];
                          if (next.length > 22) return;
                          setWorkerCycles(idx, next);
                        }}
                        disabled={workerCycles.length >= 22}
                      >
                        + Takt
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                        onClick={() => {
                          if (workerCycles.length <= 1) return;
                          setWorkerCycles(idx, workerCycles.slice(0, -1));
                        }}
                        disabled={workerCycles.length <= 1}
                      >
                        – Takt
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-500">Arbeitstakte je Arbeiter</div>
                    <div className="space-y-2">
                      {workerCycles.map((val, j) => (
                        <div key={j} className="rounded-lg border border-slate-200/70 p-3 space-y-2">
                          <div className="text-xs font-semibold text-slate-500">Takt {j + 1}</div>
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                            <select
                              className="w-full rounded border px-2 py-2 text-sm"
                              value={val ?? ""}
                              onChange={(e) => {
                                const next = e.target.value;
                                const list = [...workerCycles];
                                list[j] = next;
                                setWorkerCycles(idx, list);
                                if (next !== "__custom__") {
                                  setCustomCycleDraft((p) => ({ ...p, [`w${idx}-${j}`]: "" }));
                                }
                              }}
                            >
                              <option value="">Bitte wählen…</option>
                              <option value="Transport">1 Transport</option>
                              <option value="Einrichten und Aufstellen">2 Einrichten und Aufstellen</option>
                              <option value="Umsetzen">3 Umsetzen</option>
                              <option value="Rammbohren/EK-bohren">4 Rammbohren/EK-bohren</option>
                              <option value="Kernbohren">5 Kernbohren</option>
                              <option value="Vollbohren">6 Vollbohren</option>
                              <option value="Hindernisse durchbohren">7 Hindernisse durchbohren</option>
                              <option value="Schachten">8 Schachten</option>
                              <option value="Proben/Bohrung aufnehmen">9 Proben/Bohrung aufnehmen</option>
                              <option value="Bo. aufnehmen m. GA">10 Bo. aufnehmen m. GA</option>
                              <option value="Pumpversuche">11 Pumpversuche</option>
                              <option value="Bohrloch Versuche">12 Bohrloch Versuche</option>
                              <option value="Bohrloch Verfüllung">13 Bohrloch Verfüllung</option>
                              <option value="Pegel:einbau mit Verfüllung">14 Pegel:einbau mit Verfüllung</option>
                              <option value="Fahrten">15 Fahrten</option>
                              <option value="Bohrstelle räumen, Flurschäden beseitigen">16 Bohrstelle räumen, Flurschäden beseitigen</option>
                              <option value="Baustelle räumen">17 Baustelle räumen</option>
                              <option value="Werkstatt/Laden">18 Werkstatt/Laden</option>
                              <option value="Geräte-Pflege/Reparatur">19 Geräte-Pflege/Reparatur</option>
                              <option value="Kampfmittel">20 Kampfmittel</option>
                              <option value="Wasser fahren">21 Wasser fahren</option>
                              <option value="Platten legen">22 Platten legen</option>
                              {customWorkCycles.map((c, idx2) => (
                                <option key={`custom-${c}`} value={c}>{23 + idx2} {c}</option>
                              ))}
                              <option value="__custom__">Eigener Takt…</option>
                            </select>
                            <input
                              className={`w-full rounded border px-2 py-2 text-sm ${isQuarterInput((Array.isArray(w.stunden) ? w.stunden[j] : "") ?? "") ? "" : "border-rose-400 bg-rose-50"}`}
                              value={(Array.isArray(w.stunden) ? w.stunden[j] : "") ?? ""}
                              onChange={(e) => {
                                const st = Array.isArray(w.stunden) ? [...w.stunden] : [];
                                while (st.length < workerCycles.length) st.push("");
                                st[j] = e.target.value;
                                setWorker(idx, { stunden: st });
                              }}
                              placeholder="Std."
                            />
                          </div>
                          {val === "__custom__" ? (
                            <div className="flex items-center gap-2">
                              <input
                                className="w-full rounded border px-2 py-2 text-sm"
                                placeholder="Eigener Takt"
                                value={customCycleDraft[`w${idx}-${j}`] ?? ""}
                                onChange={(e) =>
                                  setCustomCycleDraft((p) => ({ ...p, [`w${idx}-${j}`]: e.target.value }))
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => {
                                  const text = (customCycleDraft[`w${idx}-${j}`] ?? "").trim();
                                  if (!text) return;
                                  const list = [...workerCycles];
                                  list[j] = text;
                                  setWorkerCycles(idx, list);
                                  setCustomWorkCycles((prev) => {
                                    const exists = prev.some((v) => v.toLowerCase() === text.toLowerCase());
                                    if (exists) return prev;
                                    if (prev.length >= MAX_CUSTOM_WORK_CYCLES) {
                                      alert(`Maximal ${MAX_CUSTOM_WORK_CYCLES} eigene Arbeitstakte erlaubt.`);
                                      return prev;
                                    }
                                    const next = [...prev, text];
                                    void saveCustomWorkCycles(next);
                                    return next;
                                  });
                                  setCustomCycleDraft((p) => ({ ...p, [`w${idx}-${j}`]: "" }));
                                }}
                              >
                                Übernehmen
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-500">Ausfall</span>
                      <input
                        className="w-full rounded border px-2 py-2 text-sm"
                        value={w.ausfallStd ?? ""}
                        onChange={(e) => setWorker(idx, { ausfallStd: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-500">Wochenendfahrt</span>
                      <input
                        className="w-full rounded border px-2 py-2 text-sm"
                        value={w.wochenendfahrt ?? ""}
                        onChange={(e) => setWorker(idx, { wochenendfahrt: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </GroupCard> : null}

      {/* ======================= TABELLE ======================= */}
      {!isRml && showStep(5) ? <GroupCard title="Tabelle (Bohrung / Proben / Verfüllung)" badge="Kernbereich">

          <RowActions
            addLabel="+ Bohrung"
            removeLabel="– Bohrung"
            onAdd={addRow}
            onRemove={removeLastRow}
            countLabel={`Bohrungen: ${safeTableRows.length} / ${MAX_TABLE_ROWS}`}
            disableAdd={safeTableRows.length >= MAX_TABLE_ROWS}
            className="mt-3"
          />

        <div className="mt-4 space-y-4">
          {safeTableRows.map((row, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="grid gap-3 2xl:grid-cols-8">
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500">Bohr‑Nr.</div>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.boNr ?? ""} onChange={(e) => setRow(i, { boNr: e.target.value })} placeholder="z.B. B1" />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500">Gebohrt von</div>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.gebohrtVon ?? ""} onChange={(e) => setRow(i, { gebohrtVon: e.target.value })} placeholder="0.0" />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500">Gebohrt bis</div>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.gebohrtBis ?? ""} onChange={(e) => setRow(i, { gebohrtBis: e.target.value })} placeholder="6.5" />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500">Verrohrt bis</div>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.verrohrtVon ?? ""} onChange={(e) => setRow(i, { verrohrtVon: e.target.value })} placeholder="0.0" />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500">Verrohrt Durchm.</div>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={row.verrohrtBis ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      const rbSet = new Set(["178", "220", "273", "324", "368", "419", "509", "700", "800", "1.180", "1.500"]);
                      const flags: VerrohrtFlag[] = val === "146" ? ["S"] : rbSet.has(val) ? ["RB"] : [];
                      setRow(i, { verrohrtBis: val, verrohrtFlags: flags });
                    }}
                  >
                    <option value="">Bitte wählen…</option>
                    <option value="146">146</option>
                    <option value="178">178</option>
                    <option value="220">220</option>
                    <option value="273">273</option>
                    <option value="324">324</option>
                    <option value="368">368</option>
                    <option value="419">419</option>
                    <option value="509">509</option>
                    <option value="700">700</option>
                    <option value="800">800</option>
                    <option value="1.180">1.180</option>
                    <option value="1.500">1.500</option>
                  </select>
                </div>



                <details className="2xl:col-span-2 rounded-lg border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">Vollbohrung (optional)</summary>
                  <div className="mt-2 grid gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Vollbohrung bis</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.vollbohrVon ?? ""} onChange={(e) => setRow(i, { vollbohrVon: e.target.value })} placeholder="8.7" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Vollbohr‑Durchm.</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.vollbohrBis ?? ""} onChange={(e) => setRow(i, { vollbohrBis: e.target.value })} placeholder="Ø 10" />
                    </div>
                  </div>
                </details>

                <details className="2xl:col-span-3 rounded-lg border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">Hindernisse (optional)</summary>
                  <div className="mt-2 grid gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Hindernis von</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.hindernisVon ?? ""} onChange={(e) => setRow(i, { hindernisVon: e.target.value })} placeholder="2.4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Hindernis bis</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.hindernisBis ?? ""} onChange={(e) => setRow(i, { hindernisBis: e.target.value })} placeholder="2.9" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Hindernis‑Zeit</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.hindernisZeit ?? ""} onChange={(e) => setRow(i, { hindernisZeit: e.target.value })} placeholder="00:05" />
                    </div>
                  </div>
                </details>

                <details className="2xl:col-span-3 rounded-lg border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">Schachten (optional)</summary>
                  <div className="mt-2 grid gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Schacht von</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.schachtenVon ?? ""} onChange={(e) => setRow(i, { schachtenVon: e.target.value })} placeholder="0.5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Schacht bis</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.schachtenBis ?? ""} onChange={(e) => setRow(i, { schachtenBis: e.target.value })} placeholder="1.0" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-500">Schacht‑Zeit</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={row.schachtenZeit ?? ""} onChange={(e) => setRow(i, { schachtenZeit: e.target.value })} placeholder="00:15" />
                    </div>
                  </div>
                </details>

                <div className="rounded-lg border p-2 2xl:col-span-2">
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(["GP", "KP", "SP", "WP", "BKB", "KK-LV"] as const).map((k: ProbenFlag) => {
                        const label = k === "KP" ? "EP" : k === "SP" ? "UP" : k;
                        return (
                        <label key={k} className="flex items-center gap-2">
                          <span className="w-10 text-slate-600">{label}</span>
                          <input
                            className="w-full rounded border px-2 py-1 text-sm"
                            value={row.probenValues?.[k] ?? ""}
                            placeholder=""
                            onChange={(e) => {
                              const value = e.target.value;
                              const flags = new Set(row.probenFlags ?? []);
                              if (value.trim() !== "") {
                                flags.add(k);
                              } else {
                                flags.delete(k);
                              }
                              setRow(i, {
                                probenFlags: Array.from(flags),
                                probenValues: { ...(row.probenValues ?? {}), [k]: value },
                              });
                            }}
                          />
                        </label>
                      )})}
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-500">Indiv. Probe</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={row.indivProbe ?? ""}
                          onChange={(e) => setRow(i, { indivProbe: e.target.value })}
                          placeholder="z.B. A1"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-500">SPT (Anzahl gesamt)</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={row.spt ?? ""}
                          onChange={(e) => setRow(i, { spt: e.target.value })}
                          placeholder="3"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
      </GroupCard> : null}

      {!isRml && showStep(6) ? <GroupCard title="Verfüllung" badge="Kernbereich">
        <RowActions
          addLabel="+ Verfüllung"
          removeLabel="– Verfüllung"
          onAdd={addRow}
          onRemove={removeLastRow}
          countLabel={`Verfüllung: ${safeTableRows.length} / ${MAX_TABLE_ROWS}`}
          disableAdd={safeTableRows.length >= MAX_TABLE_ROWS}
          className="mt-3"
        />
        <div className="mt-3 space-y-4">
          {safeTableRows.map((row, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="text-sm font-medium mb-3">Bohrung {row.boNr || `#${i + 1}`}</div>
              <div className="grid gap-3 lg:grid-cols-8">
                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Ton</div>
                <div className="lg:col-span-6 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.tonVon ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.tonVon ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonVon: next } });
                      }}
                      placeholder="Ton von"
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.tonBis ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.tonBis ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonBis: next } });
                      }}
                      placeholder="Ton bis"
                    />
                  </div>
                  {expandedLines[`ton-${i}`] ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.tonVon ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.tonVon ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonVon: next } });
                        }}
                        placeholder="Ton von (2. Zeile)"
                      />
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.tonBis ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.tonBis ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonBis: next } });
                        }}
                        placeholder="Ton bis (2. Zeile)"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() =>
                      setExpandedLines((p) => {
                        const next = !p[`ton-${i}`];
                        if (!next) {
                          const v = String(row.verfuellung?.tonVon ?? "").split("\n")[0] ?? "";
                          const b = String(row.verfuellung?.tonBis ?? "").split("\n")[0] ?? "";
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonVon: v, tonBis: b } });
                        }
                        return { ...p, [`ton-${i}`]: next };
                      })
                    }
                  >
                    {expandedLines[`ton-${i}`] ? "– Verfüllung" : "+ Verfüllung"}
                  </button>
                </div>

                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Bohrgut</div>
                <div className="lg:col-span-6 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={(row.verfuellung?.bohrgutVon ?? "").split("\n")[0] ?? ""}
                    onChange={(e) => {
                      const lines = String(row.verfuellung?.bohrgutVon ?? "").split("\n");
                      lines[0] = e.target.value;
                      const next = lines.filter(Boolean).join("\n");
                      setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutVon: next } });
                    }}
                    placeholder="Bohrgut von"
                  />
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={(row.verfuellung?.bohrgutBis ?? "").split("\n")[0] ?? ""}
                    onChange={(e) => {
                      const lines = String(row.verfuellung?.bohrgutBis ?? "").split("\n");
                      lines[0] = e.target.value;
                      const next = lines.filter(Boolean).join("\n");
                      setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutBis: next } });
                    }}
                    placeholder="Bohrgut bis"
                  />
                  </div>
                  {expandedLines[`bohrgut-${i}`] ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.bohrgutVon ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.bohrgutVon ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutVon: next } });
                        }}
                        placeholder="Bohrgut von (2. Zeile)"
                      />
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                      value={(row.verfuellung?.bohrgutBis ?? "").split("\n")[1] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.bohrgutBis ?? "").split("\n");
                        lines[1] = e.target.value;
                        const next = lines.filter(Boolean).slice(0, 2).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutBis: next } });
                      }}
                      placeholder="Bohrgut bis (2. Zeile)"
                    />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() =>
                      setExpandedLines((p) => {
                        const next = !p[`bohrgut-${i}`];
                        if (!next) {
                          const v = String(row.verfuellung?.bohrgutVon ?? "").split("\n")[0] ?? "";
                          const b = String(row.verfuellung?.bohrgutBis ?? "").split("\n")[0] ?? "";
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutVon: v, bohrgutBis: b } });
                        }
                        return { ...p, [`bohrgut-${i}`]: next };
                      })
                    }
                  >
                    {expandedLines[`bohrgut-${i}`] ? "– Verfüllung" : "+ Verfüllung"}
                  </button>
                </div>

                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Zement-Bent.</div>
                <div className="lg:col-span-6 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.zementBentVon ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.zementBentVon ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: next } });
                      }}
                      placeholder="Zement-Bent. von"
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.zementBentBis ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.zementBentBis ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentBis: next } });
                      }}
                      placeholder="Zement-Bent. bis"
                    />
                  </div>
                  {expandedLines[`zement-${i}`] ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.zementBentVon ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.zementBentVon ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: next } });
                        }}
                        placeholder="Zement-Bent. von (2. Zeile)"
                      />
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.zementBentBis ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.zementBentBis ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentBis: next } });
                        }}
                        placeholder="Zement-Bent. bis (2. Zeile)"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() =>
                      setExpandedLines((p) => {
                        const next = !p[`zement-${i}`];
                        if (!next) {
                          const v = String(row.verfuellung?.zementBentVon ?? "").split("\n")[0] ?? "";
                          const b = String(row.verfuellung?.zementBentBis ?? "").split("\n")[0] ?? "";
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: v, zementBentBis: b } });
                        }
                        return { ...p, [`zement-${i}`]: next };
                      })
                    }
                  >
                    {expandedLines[`zement-${i}`] ? "– Verfüllung" : "+ Verfüllung"}
                  </button>
                </div>

                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Beton</div>
                <div className="lg:col-span-6 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.betonVon ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.betonVon ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: next } });
                      }}
                      placeholder="Beton von"
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={(row.verfuellung?.betonBis ?? "").split("\n")[0] ?? ""}
                      onChange={(e) => {
                        const lines = String(row.verfuellung?.betonBis ?? "").split("\n");
                        lines[0] = e.target.value;
                        const next = lines.filter(Boolean).join("\n");
                        setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonBis: next } });
                      }}
                      placeholder="Beton bis"
                    />
                  </div>
                  {expandedLines[`beton-${i}`] ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.betonVon ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.betonVon ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: next } });
                        }}
                        placeholder="Beton von (2. Zeile)"
                      />
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-xs"
                        value={(row.verfuellung?.betonBis ?? "").split("\n")[1] ?? ""}
                        onChange={(e) => {
                          const lines = String(row.verfuellung?.betonBis ?? "").split("\n");
                          lines[1] = e.target.value;
                          const next = lines.filter(Boolean).slice(0, 2).join("\n");
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonBis: next } });
                        }}
                        placeholder="Beton bis (2. Zeile)"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() =>
                      setExpandedLines((p) => {
                        const next = !p[`beton-${i}`];
                        if (!next) {
                          const v = String(row.verfuellung?.betonVon ?? "").split("\n")[0] ?? "";
                          const b = String(row.verfuellung?.betonBis ?? "").split("\n")[0] ?? "";
                          setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: v, betonBis: b } });
                        }
                        return { ...p, [`beton-${i}`]: next };
                      })
                    }
                  >
                    {expandedLines[`beton-${i}`] ? "– Verfüllung" : "+ Verfüllung"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= UMSETZEN ======================= */}
      {showStep(1) && !isRml ? <GroupCard title="Umsetzen" badge="Logistik">

        <RowActions
          addLabel="+ Umsetzen"
          removeLabel="– Umsetzen"
          onAdd={addUmsetzenRow}
          onRemove={removeLastUmsetzenRow}
          countLabel={`Umsetzen: ${safeUmsetzen.length} / ${MAX_UMSETZEN_ROWS}`}
          disableAdd={safeUmsetzen.length >= MAX_UMSETZEN_ROWS}
          className="mt-3"
        />

        <div className="mt-4 space-y-3">
          {safeUmsetzen.map((r, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="lg:col-span-3 space-y-2">
                  <input
                    className="rounded-xl border p-3 w-full"
                    value={r.von ?? ""}
                    onChange={(e) => setUmsetzenLocationText(i, "von", e.target.value)}
                    placeholder="von (Ort suchen)"
                  />
                  {(umsetzenSuggestions[umsetzenFieldKey(i, "von")] ?? []).length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-1">
                      {(umsetzenSuggestions[umsetzenFieldKey(i, "von")] ?? []).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => chooseUmsetzenSuggestion(i, "von", s)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="lg:col-span-3 space-y-2">
                  <input
                    className="rounded-xl border p-3 w-full"
                    value={r.auf ?? ""}
                    onChange={(e) => setUmsetzenLocationText(i, "auf", e.target.value)}
                    placeholder="nach (Ort suchen)"
                  />
                  {(umsetzenSuggestions[umsetzenFieldKey(i, "auf")] ?? []).length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-1">
                      {(umsetzenSuggestions[umsetzenFieldKey(i, "auf")] ?? []).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => chooseUmsetzenSuggestion(i, "auf", s)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.entfernungM ?? ""} onChange={(e) => setUmsetzenRow(i, { entfernungM: e.target.value })} placeholder="Entfernung (km)" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.zeit ?? ""} onChange={(e) => setUmsetzenRow(i, { zeit: e.target.value })} placeholder="Zeit (hh:mm)" />
                <input className="rounded-xl border p-3 lg:col-span-1" value={r.begruendung ?? ""} onChange={(e) => setUmsetzenRow(i, { begruendung: e.target.value })} placeholder="Begründung" />
                <input className="rounded-xl border p-3 lg:col-span-1" value={r.wartezeit ?? ""} onChange={(e) => setUmsetzenRow(i, { wartezeit: e.target.value })} placeholder="Wartezeit" />
                <div className="lg:col-span-12 flex justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => updateUmsetzenRoute(i)}
                    disabled={Boolean(umsetzenRouteLoading[i])}
                  >
                    {umsetzenRouteLoading[i] ? "Berechne…" : "Entfernung/Zeit berechnen"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= PEGELAUSBAU ======================= */}
      {!isRml && showStep(7) ? <GroupCard title="Pegelausbau" badge="Ausbau">

        <RowActions
          addLabel="+ Pegel"
          removeLabel="– Pegel"
          onAdd={addPegelRow}
          onRemove={removeLastPegelRow}
          countLabel={`Pegel: ${safePegel.length} / ${MAX_PEGEL_ROWS}`}
          disableAdd={safePegel.length >= MAX_PEGEL_ROWS}
          className="mt-3"
        />

        {safePegel.map((r, i) => (
          <div key={i} className="mt-4 rounded-xl border p-4 space-y-5">
            {String(r.bohrNr ?? "").trim() ? null : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Bitte zuerst eine Bohrung auswählen.
              </div>
            )}
            {/* Kopf */}
            <div className="grid lg:grid-cols-4 gap-3">
              {bohrNrOptions.length ? (
                <select
                  className="rounded-xl border p-3"
                  value={r.bohrNr ?? ""}
                  onChange={(e) => updatePegel(i, { bohrNr: e.target.value })}
                >
                  <option value="">Bohr Nr.</option>
                  {bohrNrOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="rounded-xl border p-3" placeholder="Bohr Nr." value={r.bohrNr} onChange={(e) => updatePegel(i, { bohrNr: e.target.value })} />
              )}
              {String(r.bohrNr ?? "").trim() ? (
                <select
                  className="rounded-xl border p-3"
                  value={r.pegelDm ?? ""}
                  onChange={(e) => updatePegel(i, { pegelDm: e.target.value })}
                >
                  <option value="">Pegel Ø</option>
                  {['2"', '3"', '4"', '5"', '6"', '8"', "DN300", "DN400", "DN500", "DN600", "DN700", "DN800"].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {String(r.bohrNr ?? "").trim() ? (
              <>
            {/* ROHRE (UI vereinfacht; Mapping bleibt auf den bestehenden PDF-Feldern) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">ROHRE</div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      const current = getRohrTypesForRow(i, r);
                      const nextType = PEGEL_ROHRART_OPTIONS.map((opt) => opt.value).find((opt) => !current.includes(opt));
                      if (!nextType) return;
                      setPegelRohrTypesByRow((prev) => ({ ...prev, [i]: [...current, nextType] }));
                    }}
                    disabled={getRohrTypesForRow(i, r).length >= PEGEL_ROHRART_OPTIONS.length}
                  >
                    + Rohr
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      const current = getRohrTypesForRow(i, r);
                      if (current.length <= 1) return;
                      const removedType = current[current.length - 1];
                      const next = current.slice(0, -1);
                      setPegelRohrTypesByRow((prev) => ({ ...prev, [i]: next }));
                      updatePegel(i, buildPegelRohrPatch(removedType, "", ""));
                    }}
                    disabled={getRohrTypesForRow(i, r).length <= 1}
                  >
                    - Rohr
                  </button>
                </div>

                {getRohrTypesForRow(i, r).map((rohrType, rohrIdx) => {
                  const values = getPegelRohrValues(r, rohrType);
                  return (
                    <div key={`${i}-${rohrIdx}-${rohrType}`} className="grid gap-2 md:grid-cols-3">
                      <select
                        className="rounded-xl border p-3"
                        value={rohrType}
                        onChange={(e) => {
                          const nextType = e.target.value as PegelRohrArt;
                          const current = getRohrTypesForRow(i, r);
                          if (!nextType || nextType === rohrType) return;
                          if (current.some((t, idx) => idx !== rohrIdx && t === nextType)) return;
                          const next = [...current];
                          next[rohrIdx] = nextType;
                          setPegelRohrTypesByRow((prev) => ({ ...prev, [i]: next }));
                          updatePegel(i, {
                            ...buildPegelRohrPatch(rohrType, "", ""),
                            ...buildPegelRohrPatch(nextType, values.von, values.bis),
                          });
                        }}
                      >
                        {PEGEL_ROHRART_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border p-3"
                        placeholder="von"
                        value={values.von}
                        onChange={(e) => updatePegel(i, buildPegelRohrPatch(rohrType, e.target.value, values.bis))}
                      />
                      <input
                        className="rounded-xl border p-3"
                        placeholder="bis"
                        value={values.bis}
                        onChange={(e) => updatePegel(i, buildPegelRohrPatch(rohrType, values.von, e.target.value))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DICHTUNG-VERFÜLLUNG (Ton, Sand, Zement-Bent, Bohrgut) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">DICHTUNG / VERFÜLLUNG</div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      const current = getVerfuellungTypesForRow(i, r);
                      const nextType = PEGEL_VERFUELLUNG_OPTIONS.map((opt) => opt.value).find(
                        (opt) => !current.includes(opt)
                      );
                      if (!nextType) return;
                      setPegelVerfuellungTypesByRow((prev) => ({ ...prev, [i]: [...current, nextType] }));
                    }}
                    disabled={getVerfuellungTypesForRow(i, r).length >= PEGEL_VERFUELLUNG_OPTIONS.length}
                  >
                    + Verfüllung
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      const current = getVerfuellungTypesForRow(i, r);
                      if (current.length <= 1) return;
                      const removedType = current[current.length - 1];
                      const next = current.slice(0, -1);
                      setPegelVerfuellungTypesByRow((prev) => ({ ...prev, [i]: next }));
                      updatePegel(i, buildPegelVerfuellungPatch(removedType, { von: "", bis: "", value: "" }));
                    }}
                    disabled={getVerfuellungTypesForRow(i, r).length <= 1}
                  >
                    - Verfüllung
                  </button>
                </div>

                {getVerfuellungTypesForRow(i, r).map((verfuellungType, verIdx) => {
                  const values = getPegelVerfuellungValues(r, verfuellungType);
                  return (
                    <div key={`${i}-vf-${verIdx}-${verfuellungType}`} className="grid gap-2 md:grid-cols-3">
                      <select
                        className="rounded-xl border p-3"
                        value={verfuellungType}
                        onChange={(e) => {
                          const nextType = e.target.value as PegelVerfuellungArt;
                          const current = getVerfuellungTypesForRow(i, r);
                          if (!nextType || nextType === verfuellungType) return;
                          if (current.some((t, idx) => idx !== verIdx && t === nextType)) return;
                          const next = [...current];
                          next[verIdx] = nextType;
                          setPegelVerfuellungTypesByRow((prev) => ({ ...prev, [i]: next }));
                          updatePegel(i, {
                            ...buildPegelVerfuellungPatch(verfuellungType, { von: "", bis: "", value: "" }),
                            ...buildPegelVerfuellungPatch(nextType, {
                              von: values.von,
                              bis: values.bis,
                              value: values.value,
                            }),
                          });
                        }}
                      >
                        {PEGEL_VERFUELLUNG_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border p-3"
                        placeholder="von"
                        value={values.von}
                        onChange={(e) =>
                          updatePegel(
                            i,
                            buildPegelVerfuellungPatch(verfuellungType, { von: e.target.value, bis: values.bis })
                          )
                        }
                      />
                      <input
                        className="rounded-xl border p-3"
                        placeholder="bis"
                        value={values.bis}
                        onChange={(e) =>
                          updatePegel(
                            i,
                            buildPegelVerfuellungPatch(verfuellungType, { von: values.von, bis: e.target.value })
                          )
                        }
                      />
                    </div>
                  );
                })}
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Filterkieskörnung
                  </div>
                  <input
                    className="rounded-xl border p-3 md:col-span-2"
                    placeholder="Körnung (mm)"
                    value={r.filterkiesKoernung ?? ""}
                    onChange={(e) => updatePegel(i, { filterkiesKoernung: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* VERSCHLÜSSE */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">VERSCHLÜSSE</div>

              <div className="grid lg:grid-cols-4 gap-3">
                {pegelBoolFields.map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(r[k])}
                      onChange={(e) => updatePegel(i, { [k]: e.target.checked } as Partial<PegelAusbauRow>)}
                    />
                    {label}
                  </label>
                ))}
                <input
                  className="w-full max-w-[140px] rounded-xl border p-2 text-sm"
                  inputMode="numeric"
                  placeholder="Abst.-Halter"
                  value={r.abstHalter ?? ""}
                  onChange={(e) => updatePegel(i, { abstHalter: e.target.value.replace(/[^\d]/g, "") })}
                />
              </div>
            </div>
              </>
            ) : null}
          </div>
        ))}
      </GroupCard> : null}
      {/* ======================= SONSTIGE / BEMERKUNGEN / UNTERSCHRIFTEN ======================= */}
      {showStep(8) ? <GroupCard title={isRml ? "Bemerkungen" : "Sonstige / Bemerkungen / Unterschriften"} badge="Abschluss">

    {/* Texte */}
    {reportType === "tagesbericht_rhein_main_link" ? (
      <div className="mt-4 grid gap-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Besucher</h3>
            <DictationButton
              onClick={() => startDictationForTarget("tb-besucher")}
              active={activeDictationTarget === "tb-besucher"}
            />
          </div>
          <textarea
            ref={(el) => {
              dictationTargetsRef.current["tb-besucher"] = el;
            }}
            className="mt-3 w-full rounded-xl border p-3 min-h-[110px]"
            value={report.besucher ?? ""}
            onChange={(e) => update("besucher", e.target.value)}
            placeholder="Besucher…"
          />
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">SHE - Vorfälle</h3>
            <DictationButton
              onClick={() => startDictationForTarget("tb-she")}
              active={activeDictationTarget === "tb-she"}
            />
          </div>
          <textarea
            ref={(el) => {
              dictationTargetsRef.current["tb-she"] = el;
            }}
            className="mt-3 w-full rounded-xl border p-3 min-h-[110px]"
            value={report.sheVorfaelle ?? ""}
            onChange={(e) => update("sheVorfaelle", e.target.value)}
            placeholder="SHE - Vorfälle…"
          />
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Sonstige Ergänzungen (Themen)</h3>
            <DictationButton
              onClick={() => startDictationForTarget("tb-toolbox")}
              active={activeDictationTarget === "tb-toolbox"}
            />
          </div>
          <textarea
            ref={(el) => {
              dictationTargetsRef.current["tb-toolbox"] = el;
            }}
            className="mt-3 w-full rounded-xl border p-3 min-h-[110px]"
            value={report.toolBoxTalks ?? ""}
            onChange={(e) => update("toolBoxTalks", e.target.value)}
            placeholder="Themen / Sonstige Ergänzungen…"
          />
        </div>
      </div>
    ) : (
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Sonstige Arbeiten</h3>
            <DictationButton
              onClick={() => startDictationForTarget("tb-otherwork")}
              active={activeDictationTarget === "tb-otherwork"}
            />
          </div>
          <textarea
            ref={(el) => {
              dictationTargetsRef.current["tb-otherwork"] = el;
            }}
            className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
            value={report.otherWork ?? ""}
            onChange={(e) => update("otherWork", e.target.value)}
            placeholder="Sonstige Arbeiten…"
          />
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Bemerkungen / Anordnungen / Besuche</h3>
            <DictationButton
              onClick={() => startDictationForTarget("tb-remarks")}
              active={activeDictationTarget === "tb-remarks"}
            />
          </div>
          <textarea
            ref={(el) => {
              dictationTargetsRef.current["tb-remarks"] = el;
            }}
            className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
            value={report.remarks ?? ""}
            onChange={(e) => update("remarks", e.target.value)}
            placeholder="Bemerkungen, Anordnungen, Besuche…"
          />
        </div>
      </div>
    )}

  {/* UNTERSCHRIFTEN */}
      {!isRml ? (
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Auftraggeber */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Unterschrift Auftraggeber / Bauleitung</h3>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={clientSigEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setClientSigEnabled(next);
                  if (!next) {
                    clearClientSig();
                    setReport((p) => ({
                      ...p,
                      signatures: {
                        ...(p.signatures ?? {}),
                        clientOrManagerName: "",
                        clientOrManagerSigPng: "",
                      },
                    }));
                  }
                }}
              />
              Unterschrift aktivieren
            </label>
          </div>

          <div className={`mt-3 space-y-3 ${clientSigEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <input
              className="w-full rounded-xl border p-3"
              value={report.signatures?.clientOrManagerName ?? ""}
              onChange={(e) =>
                setReport((p) => ({
                  ...p,
                  signatures: {
                    ...(p.signatures ?? {}),
                    clientOrManagerName: e.target.value,
                  },
                }))
              }
              placeholder="Name"
            />

            <div className="rounded-xl border bg-white">
              <SignatureCanvas
                ref={sigClientRef}
                penColor="black"
                onEnd={saveClientSignature}
                canvasProps={{
                  width: 500,
                  height: 150,
                  className: "w-full h-[150px]",
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                onClick={clearClientSig}
              >
                Löschen
              </button>
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                onClick={saveClientSignature}
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>

        {/* Bohrmeister */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <h3 className="font-medium">Unterschrift Bohrmeister</h3>

          <input
            className="mt-3 w-full rounded-xl border p-3"
            value={report.signatures?.drillerName ?? ""}
            onChange={(e) =>
              setReport((p) => ({
                ...p,
                signatures: {
                  ...(p.signatures ?? {}),
                  drillerName: e.target.value,
                },
              }))
            }
            placeholder="Name"
          />

          <div className="mt-3 rounded-xl border bg-white">
            <SignatureCanvas
              ref={sigDrillerRef}
              penColor="black"
              onEnd={saveDrillerSignature}
              canvasProps={{
                width: 500,
                height: 150,
                className: "w-full h-[150px]",
              }}
            />
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
              onClick={clearDrillerSig}
            >
              Löschen
            </button>
            <button
              type="button"
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
              onClick={saveDrillerSignature}
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </GroupCard> : null}

      {showStep(9) && isRml ? (
        <GroupCard title="Prüfung & Unterschriften" badge="Abschluss">
          <div className="mt-2 space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <h3 className="font-medium">Tägliche Überprüfung BG</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BG_CHECK_OPTIONS.map((item) => (
                  <label
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={rmlBgCheckSet.has(item)}
                      onChange={(e) => toggleRmlBgCheck(item, e.target.checked)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <h3 className="font-medium">Unterschrift Bohrgeräteführer</h3>
                <input
                  className="mt-3 w-full rounded-xl border p-3"
                  value={report.signatures?.drillerName ?? ""}
                  onChange={(e) =>
                    setReport((p) => ({
                      ...p,
                      signatures: {
                        ...(p.signatures ?? {}),
                        drillerName: e.target.value,
                      },
                    }))
                  }
                  placeholder="Name"
                />
                <div className="mt-3 rounded-xl border bg-white">
                  <SignatureCanvas
                    ref={sigDrillerRef}
                    penColor="black"
                    onEnd={saveDrillerSignature}
                    canvasProps={{
                      width: 500,
                      height: 150,
                      className: "w-full h-[150px]",
                    }}
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                    onClick={clearDrillerSig}
                  >
                    Löschen
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                    onClick={saveDrillerSignature}
                  >
                    Übernehmen
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Für den Auftraggeber (Name, Unterschrift)</h3>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={clientSigEnabled}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setClientSigEnabled(next);
                        if (!next) {
                          clearClientSig();
                          setReport((p) => ({
                            ...p,
                            signatures: {
                              ...(p.signatures ?? {}),
                              clientOrManagerName: "",
                              clientOrManagerSigPng: "",
                            },
                          }));
                        }
                      }}
                    />
                    Unterschrift aktivieren
                  </label>
                </div>

                <div className={`mt-3 space-y-3 ${clientSigEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                  <input
                    className="w-full rounded-xl border p-3"
                    value={report.signatures?.clientOrManagerName ?? ""}
                    onChange={(e) =>
                      setReport((p) => ({
                        ...p,
                        signatures: {
                          ...(p.signatures ?? {}),
                          clientOrManagerName: e.target.value,
                        },
                      }))
                    }
                    placeholder="Name"
                  />
                  <div className="rounded-xl border bg-white">
                    <SignatureCanvas
                      ref={sigClientRef}
                      penColor="black"
                      onEnd={saveClientSignature}
                      canvasProps={{
                        width: 500,
                        height: 150,
                        className: "w-full h-[150px]",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                      onClick={clearClientSig}
                    >
                      Löschen
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 text-sm"
                      onClick={saveClientSignature}
                    >
                      Übernehmen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GroupCard>
      ) : null}

      {/* ======================= BUTTONS ======================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {effectiveProjectId ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                window.location.href = `/projects/${effectiveProjectId}`;
              }}
            >
              Zu Projekt
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fillTestData}
          >
            Testdaten füllen
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={resetAllInputs}
          >
            Alles löschen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openTestPdf}
          >
            Vorschau
          </button>
          {isRmlDevTestUser ? (
            <button
              type="button"
              className="btn border-amber-700 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                forceMyReportsSaveOnceRef.current = true;
                void triggerSaveReport();
              }}
              title="Nur für Dev-Test: Speichert diesen RML-Bericht in Meine Berichte statt ins Projekt."
            >
              Dev: In Meine Berichte speichern
            </button>
          ) : null}
        </div>
        {useStepper ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStepIndexKeepingScroll((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
            >
              Zurück
            </button>
            <button
              type="button"
              className="btn border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                void triggerSaveReport();
              }}
            >
              Speichern
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const legalBreakCheck = enforceLegalBreakRules(reportRef.current);
                if (legalBreakCheck.warnings.length > 0) {
                  const preview = legalBreakCheck.warnings.slice(0, 4).join("\n");
                  const suffix =
                    legalBreakCheck.warnings.length > 4
                      ? `\n+ ${legalBreakCheck.warnings.length - 4} weitere Zeile(n)`
                      : "";
                  const ok = window.confirm(
                    `Gesetzliche Pausenregel nicht erfüllt:\n${preview}${suffix}\n\nAutomatisch ergänzen und weiter?`
                  );
                  if (!ok) {
                    alert("Weiter abgebrochen. Bitte Pausen ergänzen.");
                    return;
                  }
                  reportRef.current = legalBreakCheck.report;
                  setReport(legalBreakCheck.report);
                }
                if (!isRml && stepIndex === 4) {
                  const invalid = safeWorkers.some((w) => hasInvalidStunden(w));
                  if (invalid) {
                    alert("Nur Viertelstunden erlaubt (z.B. 0.25, 0.5, 0.75).");
                    return;
                  }
                  if (
                    report.workCyclesSame &&
                    (!areTimeRowsUniform(Array.isArray(report.workTimeRows) ? report.workTimeRows : []) ||
                      !areTimeRowsUniform(Array.isArray(report.breakRows) ? report.breakRows : []))
                  ) {
                    alert("Alle Arbeitstakte gleich ist nur möglich, wenn Arbeitszeiten und Pausen identisch sind.");
                    return;
                  }
                  const mismatches = safeWorkers.filter((w, idx) => isWorkerMismatch(w, idx));
                  if (mismatches.length > 0) {
                    alert("Arbeitszeit/Pausen stimmen nicht mit den Takt-Stunden überein.");
                    return;
                  }
                }
                void saveDraftToServer();
                setStepIndexKeepingScroll((i) => Math.min(steps.length - 1, i + 1));
              }}
              disabled={stepIndex >= steps.length - 1}
            >
              Weiter
            </button>
          </div>
        ) : null}
      </div>

    </div>
  );
}
