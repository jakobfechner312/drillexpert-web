"use client";

import { createClient } from "@/lib/supabase/browser";
import { useDraftActions } from "@/components/DraftActions";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useSearchParams } from "next/navigation";

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
  };
}

function emptyUmsetzenRow(): UmsetzenRow {
  return { von: "", auf: "", entfernungM: "", zeit: "", begruendung: "", wartezeit: "" };
}

function emptyTransportRow() {
  return { from: "", to: "", km: null, time: "" };
}

const emptyTimeRow = () => ({ name: "", from: "", to: "" });

function emptyPegelAusbauRow(): PegelAusbauRow {
  return {
    bohrNr: "",
    pegelDm: "",

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
  <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
    <div className="flex items-center justify-between gap-3 bg-sky-50/60 px-4 py-2 border-b border-slate-200/70">
      <h2 className="text-sm font-semibold text-sky-900 tracking-wide">{title}</h2>
      {badge ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {badge}
        </span>
      ) : null}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const SubGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200/70 bg-white">
    <div className="border-b border-slate-200/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {title}
    </div>
    <div className="p-3">{children}</div>
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
  <div className={["flex flex-wrap items-center justify-between gap-3", className].filter(Boolean).join(" ")}>
    <span className="text-sm text-slate-500">{countLabel ?? ""}</span>
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
  r.tableRows = Array.isArray(r.tableRows) && r.tableRows.length ? r.tableRows : [emptyTableRow()];
  r.workers = Array.isArray(r.workers) && r.workers.length ? r.workers : [emptyWorker()];
  r.umsetzenRows = Array.isArray(r.umsetzenRows) && r.umsetzenRows.length ? r.umsetzenRows : [emptyUmsetzenRow()];
  r.pegelAusbauRows =
    Array.isArray(r.pegelAusbauRows) && r.pegelAusbauRows.length ? r.pegelAusbauRows : [emptyPegelAusbauRow()];

  // diese Arrays nutzt dein UI (WorkTime/Break/Transport)
  r.workTimeRows = Array.isArray(r.workTimeRows) && r.workTimeRows.length ? r.workTimeRows : [emptyTimeRow()];
  r.breakRows = Array.isArray(r.breakRows) && r.breakRows.length ? r.breakRows : [emptyTimeRow()];
  r.transportRows = Array.isArray(r.transportRows) && r.transportRows.length ? r.transportRows : [emptyTransportRow()];

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
    // "HH:MM:SS" -> "HH:MM"
    if (/^\d{2}:\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
    // "HH:MM" passt schon
    if (/^\d{2}:\d{2}$/.test(v)) return v;
    return v;
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
      time: toHHMM(row?.time ?? ""),
    }));
  }

  return r as Tagesbericht;
}
export default function TagesberichtForm({ projectId, reportId, mode = "create", stepper = true }: TagesberichtFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  useEffect(() => {
    console.log("[PROPS CHECK]", { mode, reportId, projectId });
  }, [mode, reportId, projectId]);

  const savingRef = useRef(false);
  const reportSaveKeyRef = useRef<string | null>(null);

  type SaveScope = "unset" | "project" | "my_reports";
  const [saveScope, setSaveScope] = useState<SaveScope>(projectId ? "project" : "unset");
  const pendingSaveResolveRef = useRef<
  ((v: { scope: SaveScope; projectId: string | null } | undefined) => void) | null
  >(null);  
  
 // nur für den Picker (wenn KEIN projectId prop da ist)
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);

  // das ist der “echte” Projektwert, den du überall nutzt
  const effectiveProjectId = projectId ?? localProjectId;

  

  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);  

  // Modal/UI state bleibt wie gehabt
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectUiLoading, setProjectUiLoading] = useState(false);

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
      .select("id,name")
      .order("created_at", { ascending: false });

    setProjectUiLoading(false);

    if (error) {
      console.error(error);
      alert("Projekte laden fehlgeschlagen: " + error.message);
      return;
    }

    setProjects((data ?? []) as { id: string; name: string }[]);
  }, []);

  const requireProjectId = useCallback(async (): Promise<string | null> => {
    if (effectiveProjectId) return effectiveProjectId;

    await loadMyProjects();
    setProjectModalOpen(true);
    return null;
   }, [effectiveProjectId, loadMyProjects]);

  const ensureSaveTarget = useCallback(async (): Promise<{ scope: SaveScope; projectId: string | null } | null> => {
    if (saveScope === "my_reports") {
      return { scope: "my_reports", projectId: null };
    }

    if (effectiveProjectId) {
      return { scope: "project", projectId: effectiveProjectId };
    }

    await loadMyProjects();
    setProjectModalOpen(true);

    const result = await new Promise<{ scope: SaveScope; projectId: string | null } | undefined>((resolve) => {
      pendingSaveResolveRef.current = resolve;
    });

    pendingSaveResolveRef.current = null;
    return result ?? null;
  }, [saveScope, effectiveProjectId, loadMyProjects]);

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
      .select("id,name")
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
    setProjects((prev) => [{ id: proj.id, name: proj.name }, ...prev]);
    setSaveScope("project");
    setLocalProjectId(proj.id);
    setNewProjectName("");
    setProjectModalOpen(false);

    pendingSaveResolveRef.current?.({ scope: "project", projectId: proj.id });
    pendingSaveResolveRef.current = null;

    setCreatingProject(false);
  }, [newProjectName]);

  const [report, setReport] = useState<Tagesbericht>(() => {
    const base = createDefaultTagesbericht();
    return {
      ...base,
      tableRows: Array.isArray(base.tableRows) && base.tableRows.length ? base.tableRows : [emptyTableRow()],
      workers: Array.isArray(base.workers) && base.workers.length ? base.workers : [emptyWorker()],
      umsetzenRows: Array.isArray(base.umsetzenRows) && base.umsetzenRows.length ? base.umsetzenRows : [emptyUmsetzenRow()],
      pegelAusbauRows: Array.isArray(base.pegelAusbauRows) && base.pegelAusbauRows.length ? base.pegelAusbauRows : [emptyPegelAusbauRow()],
    };
  });
  const [customCycleDraft, setCustomCycleDraft] = useState<Record<number, string>>({});
  const [customWorkCycles, setCustomWorkCycles] = useState<string[]>([]);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [pegelSumpfEnabled, setPegelSumpfEnabled] = useState<Record<number, boolean>>({});
  const [clientSigEnabled, setClientSigEnabled] = useState(false);
  const [pegelMode, setPegelMode] = useState<"ueberflur" | "unterflur" | null>(null);
  const [pegelPromptOpen, setPegelPromptOpen] = useState(false);
  const useStepper = stepper;
  const steps = useMemo(
    () => [
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
    []
  );
  const [stepIndex, setStepIndex] = useState(0);

  const MAX_CUSTOM_WORK_CYCLES = 5;

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

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

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
    if (stepIndex === 7 && !pegelMode) {
      setPegelPromptOpen(true);
    }
  }, [stepIndex, pegelMode]);

  useEffect(() => {
    if (clientSigEnabled) return;
    const hasClientSig =
      Boolean(report?.signatures?.clientOrManagerSigPng) ||
      Boolean(report?.signatures?.clientOrManagerName);
    if (hasClientSig) setClientSigEnabled(true);
  }, [clientSigEnabled, report?.signatures?.clientOrManagerSigPng, report?.signatures?.clientOrManagerName]);

  useEffect(() => {
    if (pegelMode !== "unterflur") return;
    setReport((p) => ({
      ...p,
      pegelAusbauRows: (Array.isArray(p.pegelAusbauRows) ? p.pegelAusbauRows : [emptyPegelAusbauRow()]).map((row) => ({
        ...row,
        aufsatzStahlVon: "",
        aufsatzStahlBis: "",
      })),
    }));
  }, [pegelMode]);

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
      setReport(normalizeTagesbericht(data.data));
    };

    load();
  }, [mode, reportId]);

  // ======================
  // 🧩 LOAD DRAFT (CREATE MODE)
  // ======================
  useEffect(() => {
    if (mode !== "create" || !draftId) return;

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

      setReport(normalizeTagesbericht(data.data));
    };

    loadDraft();
  }, [mode, draftId]);

  // ================== DRAFT + REPORT SAVE HANDLERS ==================
  const { setSaveDraftHandler, setSaveReportHandler } = useDraftActions();

  useEffect(() => {
    console.log("[Form] register save handlers");
    const supabase = createClient();

    // ✅ Draft speichern
    setSaveDraftHandler(async () => {
      console.log("[Form] saveDraft START");

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
    console.log("[Form] getUser done", { userErr, hasUser: !!userRes?.user });

      const user = userRes.user;
      if (!user) return alert("Nicht eingeloggt.");

      const pid = effectiveProjectId ?? null;

      const currentReport = reportRef.current;
      console.log("[Form] inserting draft…");

      const title =
        currentReport?.project?.trim()
          ? `Tagesbericht – ${currentReport.project} (${currentReport.date})`
          : `Tagesbericht Entwurf (${currentReport?.date ?? ""})`;

      const { error } = await supabase.from("drafts").insert({
        user_id: user.id,
        project_id: pid,
        report_type: "tagesbericht",
        title,
        data: currentReport,
      });

      console.log("[Form] insert done", { error });

      if (error) {
        console.error(error);
        return alert("Entwurf speichern fehlgeschlagen: " + error.message);
      }

      alert("Entwurf gespeichert ✅");
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

        // ✅ DB-seitig: gleicher Key für denselben Save-Vorgang
        if (!reportSaveKeyRef.current) {
          reportSaveKeyRef.current = crypto.randomUUID();
        }

        const currentReport = reportRef.current;
        console.log("[SAVE] currentReport.client", currentReport.client);
        console.log("[SAVE] currentReport.project", currentReport.project);
        console.log("[SAVE] currentReport.vehicles", currentReport.vehicles);
        console.log("[SAVE] currentReport.worker0 name", currentReport.workers?.[0]?.name);

        const title =
          currentReport?.project?.trim()
            ? `Tagesbericht – ${currentReport.project} (${currentReport.date})`
            : `Tagesbericht (${currentReport?.date ?? ""})`;

        // ===============================
// EDIT → UPDATE
// ===============================
if (mode === "edit") {
  if (!reportId) {
    alert("Fehler: reportId fehlt im Edit-Modus");
    return;
  }

  const { error } = await supabase
    .from("reports")
    .update({
      title,
      data: currentReport,
      status: "final",
      project_id: pid,
    })
    .eq("id", reportId);

  if (error) {
    console.error(error);
    alert("Bericht aktualisieren fehlgeschlagen: " + error.message);
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
    project_id: scope === "project" ? pid : null,
    report_type: "tagesbericht",
    title,
    data: currentReport,
    status: "final",
    idempotency_key: idempotencyKey,
  } satisfies {
    user_id: string;
    project_id: string | null;
    report_type: "tagesbericht";
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
    mode,
    reportId,
    saveScope,
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
      localStorage.setItem("tagesbericht_draft", JSON.stringify(reportRef.current));
      alert("Entwurf lokal gespeichert ✅");
    } catch (e) {
      console.error("Local draft save failed", e);
      alert("Lokales Speichern fehlgeschlagen.");
    }
  }

  async function downloadPdfToLocal() {
    try {
      const payload = reportRef.current;
      const res = await fetch("/api/pdf/tagesbericht", {
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
    if (mode === "edit" || draftId) return;
    try {
      const allowAuto = localStorage.getItem("pref_autoload_draft");
      if (allowAuto === "false") return;
      const raw = localStorage.getItem("tagesbericht_draft");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setReport(normalizeTagesbericht(parsed));
    } catch (e) {
      console.warn("Local draft load failed", e);
    }
  }, [mode]);

  function fillTestData() {
    const base = createDefaultTagesbericht();
    const today = new Date().toISOString().slice(0, 10);

    const filled: Tagesbericht = {
      ...base,
      date: today,
      project: "Baustelle Freiburg Nord",
      client: "Stadt Freiburg",
      name: "Team A",
      vehicles: "LKW 7.5t, Bohrgerät X2, Sprinter",
      aNr: "A-2026-001",
      device: "Bohrgerät BG-12",
      trailer: "Anhänger 2t",
      workTimeRows: [
        { name: "Max Mustermann", from: "07:00", to: "12:00" },
        { name: "Erika Beispiel", from: "12:30", to: "16:30" },
      ],
      breakRows: [
        { name: "Max Mustermann", from: "09:30", to: "09:45" },
        { name: "Erika Beispiel", from: "12:00", to: "12:30" },
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
      otherWork: "Material angeliefert, Baustelle eingerichtet, Sondierung.",
      remarks: "Keine besonderen Vorkommnisse.",
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
      workers: Array.from({ length: 3 }, (_, i) => ({
        ...emptyWorker(),
        name: i === 0 ? "Max Mustermann" : i === 1 ? "Erika Beispiel" : "Tim B.",
        reineArbeitsStd: i === 2 ? "6.5" : "8",
        wochenendfahrt: "0",
        ausfallStd: i === 1 ? "0.5" : "0",
        ausloeseT: i === 0,
        ausloeseN: i === 1,
        arbeitsakteNr: `AA-100${i + 1}`,
        stunden: Array(4)
          .fill("")
          .map((_, j) => (j % (i + 2) === 0 ? "1" : "")),
      })),
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

  async function openTestPdf() {
    console.log("[PREVIEW payload]", report);
    const res = await fetch("/api/pdf/tagesbericht", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!res.ok) return alert("PDF-API Fehler");
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  /** ---------- Tabelle ---------- */
  const MAX_TABLE_ROWS = 5;
  const MAX_UMSETZEN_ROWS = 3;
  const MAX_PEGEL_ROWS = 3;

  const safeTableRows = useMemo<TableRow[]>(
    () => (Array.isArray(report.tableRows) && report.tableRows.length ? report.tableRows : [emptyTableRow()]),
    [report.tableRows]
  );

  function setRow(i: number, patch: Partial<TableRow>) {
    setReport((p) => {
      const rows = Array.isArray(p.tableRows) && p.tableRows.length ? [...p.tableRows] : [emptyTableRow()];
      rows[i] = { ...rows[i], ...patch };
      return { ...p, tableRows: rows };
    });
  }

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

  const parseTimeToMinutes = (value?: string | null) => {
    if (!value) return null;
    const [h, m] = value.split(":").map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const formatHours = (minutes: number) => {
    const hours = Math.max(0, minutes / 60);
    const rounded = Math.round(hours * 2) / 2;
    return rounded % 1 === 0 ? String(Math.trunc(rounded)) : String(rounded);
  };

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

  useEffect(() => {
    const workers = Array.isArray(report.workers) ? report.workers : [];
    const workRows = Array.isArray(report.workTimeRows) ? report.workTimeRows : [];
    const validRows = workRows.filter((r) => parseTimeToMinutes(r?.from) != null && parseTimeToMinutes(r?.to) != null);
    const requiredWorkers = validRows.length >= 2 ? 2 : workers.length || 1;

    const nameSlots = workRows.map((r) => String(r?.name ?? ""));

    let changed = false;
    const nextWorkers = [...workers];
    while (nextWorkers.length < Math.max(requiredWorkers, nameSlots.length || 1)) {
      nextWorkers.push(emptyWorker());
      changed = true;
    }

    for (let idx = 0; idx < nextWorkers.length; idx++) {
      const w = nextWorkers[idx];
      const workMin = calcWorkMinutesForWorker(idx);
      if (workMin != null) {
        const breakMinutes = calcBreakMinutesForWorker(idx);
        const reine = formatHours(Math.max(0, workMin - breakMinutes));
        if (w.reineArbeitsStd !== reine) {
          nextWorkers[idx] = { ...w, reineArbeitsStd: reine };
          changed = true;
        }
      }

      if (idx < nameSlots.length && w.name !== nameSlots[idx]) {
        nextWorkers[idx] = { ...nextWorkers[idx], name: nameSlots[idx] };
        changed = true;
      }
    }

    if (changed) {
      setReport((p) => ({ ...p, workers: nextWorkers }));
    }
  }, [report.workTimeRows, report.breakRows, report.workers]);
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

  function addPegelRow() {
    setReport((p) => {
      const rows = Array.isArray(p.pegelAusbauRows) && p.pegelAusbauRows.length ? [...p.pegelAusbauRows] : [];
      if (rows.length >= MAX_PEGEL_ROWS) return { ...p, pegelAusbauRows: rows.length ? rows : [emptyPegelAusbauRow()] };
      rows.push(emptyPegelAusbauRow());
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
    | "klarpump";

  const pegelBoolFields: Array<[PegelBooleanKey, string]> = [
    ["sebaKap", "Seba Kap."],
    ["boKap", "Bo Kap."],
    ["hydrKap", "Hydr. Kap."],
    ["fernGask", "Fern-Gask."],
    ["passavant", "Passavant"],
    ["betonSockel", "Betonsockel"],
    ["klarpump", "Klarpump."],
  ];

  const showStep = (index: number) => !useStepper || stepIndex === index;
  const showHeaderBlock = !useStepper || stepIndex <= 3;
  const headerGridClass = useStepper
    ? "grid gap-5 md:grid-cols-1"
    : "grid gap-5 md:grid-cols-2 xl:grid-cols-[1.35fr_1.35fr_1.2fr]";

  return (
    <div className="mt-6 space-y-6 max-w-[2000px] mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16 text-slate-900 min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 rounded-3xl border border-slate-200/60 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]">
      {useStepper ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Schritt {stepIndex + 1} von {steps.length}
              </div>
              <div className="text-lg font-semibold text-slate-900">{steps[stepIndex]?.title}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sky-900">Projekt auswählen</h3>
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50"
                onClick={() => {
                  setProjectModalOpen(false);
                  pendingSaveResolveRef.current?.(undefined);
                  pendingSaveResolveRef.current = null;
                }}
              >
                Schließen
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="w-full rounded-xl border px-3 py-3 text-left hover:bg-slate-50"
                onClick={() => {
                  setSaveScope("my_reports");
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
              <div className="rounded-xl border p-3">
                <div className="text-sm font-medium">Neues Projekt</div>

                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 rounded-xl border p-3"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="z.B. Baustelle Freiburg Nord"
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
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
                <p className="text-sm text-slate-600">Lade Projekte…</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-slate-600">Noch keine Projekte vorhanden.</p>
              ) : (
                <div className="space-y-2">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full rounded-xl border px-3 py-3 text-left hover:bg-slate-50"
                      onClick={() => {
                        setSaveScope("project");
                        setLocalProjectId(p.id);
                        setProjectModalOpen(false);
                        pendingSaveResolveRef.current?.({ scope: "project", projectId: p.id });
                        pendingSaveResolveRef.current = null;
                      }}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {pegelPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow">
            <h3 className="text-lg font-semibold text-sky-900">Pegel‑Ausbau</h3>
            <p className="mt-2 text-sm text-slate-600">
              Bitte auswählen, ob der Ausbau unter- oder überflur erfolgt.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sky-700 hover:bg-sky-50"
                onClick={() => {
                  setPegelMode("ueberflur");
                  setPegelPromptOpen(false);
                }}
              >
                Überflur
              </button>
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sky-700 hover:bg-sky-50"
                onClick={() => {
                  setPegelMode("unterflur");
                  setPegelPromptOpen(false);
                }}
              >
                Unterflur
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======================= KOPF (PDF-LAYOUT) ======================= */}
      {showHeaderBlock ? (
        <GroupCard title="Tagesbericht" badge="Kopfbereich">
          {(!useStepper || showStep(0)) ? null : null}
          <div className={headerGridClass}>
            {showStep(0) ? (
              <SubGroup title="Stammdaten">
                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-sm text-slate-600">Datum</span>
                    <input
                      type="date"
                      className="w-full rounded-xl border p-3"
                      value={report.date ?? ""}
                      onChange={(e) => update("date", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-600">Projekt</span>
                    <input
                      className="w-full rounded-xl border p-3"
                      value={report.project ?? ""}
                      onChange={(e) => update("project", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-slate-600">Auftraggeber</span>
                    <input
                      className="w-full rounded-xl border p-3"
                      value={report.client ?? ""}
                      onChange={(e) => update("client", e.target.value)}
                    />
                  </label>
                </div>
              </SubGroup>
            ) : null}

            {(showStep(1) || showStep(3)) ? (
              <SubGroup title="Fahrzeuge & Zeiten">
                {showStep(1) ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 md:col-span-3">
                      <span className="text-sm text-slate-600">Fahrzeuge</span>
                      <input className="w-full rounded-xl border p-3" value={report.vehicles ?? ""} onChange={(e) => update("vehicles", e.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-slate-600">A.Nr.</span>
                      <input className="w-full rounded-xl border p-3" value={report.aNr ?? ""} onChange={(e) => update("aNr", e.target.value)} />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-sm text-slate-600">Gerät</span>
                      <input className="w-full rounded-xl border p-3" value={report.device ?? ""} onChange={(e) => update("device", e.target.value)} />
                    </label>
                  </div>
                ) : null}

                {showStep(3) ? (
                  <div className="mt-4 rounded-xl border border-slate-200/70 p-3 bg-slate-50/60">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Arbeitszeit & Pausen</h4>
                      <RowActions
                        addLabel="+ Zeit"
                        removeLabel="– Zeit"
                        onAdd={addWorkAndBreakRow}
                        onRemove={removeLastWorkAndBreakRow}
                        className=""
                      />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                        <div className="text-sm font-medium text-slate-700">Arbeitszeit</div>
                        <div className="mt-2 space-y-3">
                          {safeWorkTimes.slice(0, 3).map((r, i) => (
                            <div key={i} className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
                              <input
                                className="w-full min-w-[140px] rounded-lg border px-2.5 py-2 text-sm"
                                value={r.name ?? ""}
                                onChange={(e) => setTimeRowName(i, e.target.value)}
                                placeholder="Name"
                              />
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.from ?? ""} onChange={(e) => setWorkTimeRow(i, { from: e.target.value })} />
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.to ?? ""} onChange={(e) => setWorkTimeRow(i, { to: e.target.value })} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                        <div className="text-sm font-medium text-slate-700">Pausen</div>
                        <div className="mt-2 space-y-3">
                          {safeBreaks.slice(0, 3).map((r, i) => (
                            <div key={i} className="grid gap-3 md:grid-cols-2">
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.from ?? ""} onChange={(e) => setBreakRow(i, { from: e.target.value })} />
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.to ?? ""} onChange={(e) => setBreakRow(i, { to: e.target.value })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </SubGroup>
            ) : null}

            {(showStep(1) || showStep(2)) ? (
              <SubGroup title="Wetter / Transport / Entfernung">
                {showStep(2) ? (
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

                {showStep(1) ? (
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
                        <div key={i} className="grid gap-3 md:grid-cols-4">
                          <input className="rounded-xl border p-3" value={r.from ?? ""} onChange={(e) => setTransportRow(i, { from: e.target.value })} placeholder="von" />
                          <input className="rounded-xl border p-3" value={r.to ?? ""} onChange={(e) => setTransportRow(i, { to: e.target.value })} placeholder="nach" />
                          <input className="rounded-xl border p-3" value={r.km ?? ""} onChange={(e) => setTransportRow(i, { km: e.target.value === "" ? null : Number(e.target.value) })} placeholder="km" />
                          <input className="rounded-xl border p-3" value={r.time ?? ""} onChange={(e) => setTransportRow(i, { time: e.target.value })} placeholder="Zeit" />
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

      {/* ======================= ARBEITER (TABELLENLAYOUT) ======================= */}
      {showStep(4) ? <GroupCard title="Arbeitstakte / Stunden" badge="Personal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RowActions
            addLabel="+ Arbeiter"
            removeLabel="– Arbeiter"
            onAdd={addWorker}
            onRemove={removeLastWorker}
            countLabel={`Arbeiter: ${safeWorkers.length}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Arbeitstakte</span>
            <button
              type="button"
              className="rounded-lg border border-sky-200 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              onClick={() =>
                setReport((p) => {
                  const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                  if (list.length >= 19) return p;
                  list.push("");
                  return { ...p, workCycles: list };
                })
              }
              disabled={(Array.isArray(report.workCycles) ? report.workCycles : []).length >= 19}
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
          </div>
        </div>

        <div className="mt-4 space-y-4 xl:hidden">
          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800">Arbeitstakte</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((val, i) => (
                <div key={i} className="rounded-lg border border-slate-200/70 p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Takt {i + 1}</div>
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
                        setCustomCycleDraft((p) => ({ ...p, [i]: "" }));
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
                    {customWorkCycles.map((c, idx) => (
                      <option key={`custom-${c}`} value={c}>{20 + idx} {c}</option>
                    ))}
                    <option value="__custom__">Eigener Takt…</option>
                  </select>
                  {val === "__custom__" ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded border px-2 py-2 text-sm"
                        placeholder="Eigener Takt"
                        value={customCycleDraft[i] ?? ""}
                        onChange={(e) =>
                          setCustomCycleDraft((p) => ({ ...p, [i]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          const text = (customCycleDraft[i] ?? "").trim();
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
                          setCustomCycleDraft((p) => ({ ...p, [i]: "" }));
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

          {safeWorkers.map((w, idx) => (
            <div key={idx} className="rounded-xl border p-4 space-y-4">
              <div className="text-sm font-semibold text-slate-800">Arbeiter {idx + 1}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Name</span>
                  <input className="w-full rounded border px-2 py-2 text-sm" value={w.name ?? ""} onChange={(e) => setWorker(idx, { name: e.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Reine Std.</span>
                  <input className="w-full rounded border px-2 py-2 text-sm bg-slate-50" value={w.reineArbeitsStd ?? ""} readOnly />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Wochenend</span>
                  <input className="w-full rounded border px-2 py-2 text-sm" value={w.wochenendfahrt ?? ""} onChange={(e) => setWorker(idx, { wochenendfahrt: e.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">Ausfall</span>
                  <input className="w-full rounded border px-2 py-2 text-sm" value={w.ausfallStd ?? ""} onChange={(e) => setWorker(idx, { ausfallStd: e.target.value })} />
                </label>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!w.ausloeseT} onChange={(e) => setWorker(idx, { ausloeseT: e.target.checked })} />
                  Auslöse T
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!w.ausloeseN} onChange={(e) => setWorker(idx, { ausloeseN: e.target.checked })} />
                  Auslöse N
                </label>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">Stunden je Takt</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((val, j) => (
                    <label key={j} className="space-y-1">
                      <span className="text-xs text-slate-500">Takt {j + 1}{val ? ` – ${val}` : ""}</span>
                      <input
                        className="w-full rounded border px-2 py-2 text-sm"
                        value={(Array.isArray(w.stunden) ? w.stunden[j] : "") ?? ""}
                        onChange={(e) => {
                          const st = Array.isArray(w.stunden) ? [...w.stunden] : [];
                          while (st.length < (Array.isArray(report.workCycles) ? report.workCycles.length : 1)) st.push("");
                          st[j] = e.target.value;
                          setWorker(idx, { stunden: st });
                        }}
                        placeholder="Std."
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 hidden xl:block overflow-x-auto rounded-xl border">
          <div className="min-w-[840px] w-full">
            <div
              className="grid w-full border-b text-[12px] font-medium text-slate-600"
              style={{
                gridTemplateColumns: `220px 80px 80px 80px 50px 50px repeat(${Math.max(
                  1,
                  (Array.isArray(report.workCycles) ? report.workCycles : []).length
                )}, minmax(140px,1fr))`,
              }}
            >
              <div className="border-b border-r px-2 py-1" />
              <div className="border-b border-r px-2 py-1" />
              <div className="border-b border-r px-2 py-1" />
              <div className="border-b border-r px-2 py-1" />
              <div className="border-b border-r px-2 py-1 text-center" style={{ gridColumn: "span 2" }}>
                Auslöse
              </div>
              {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((_, i) => (
                <div key={i} className="border-b border-r px-2 py-1 text-center text-[11px] font-semibold text-slate-500">
                  {i + 1}
                </div>
              ))}
            </div>
            <div
              className="grid w-full border-b text-[12px] font-medium text-slate-600"
              style={{
                gridTemplateColumns: `220px 80px 80px 80px 50px 50px repeat(${Math.max(
                  1,
                  (Array.isArray(report.workCycles) ? report.workCycles : []).length
                )}, minmax(120px,1fr))`,
              }}
            >
              <div className="border-b border-r px-2 py-2">Name</div>
              <div className="border-b border-r px-2 py-2">Reine Std.</div>
              <div className="border-b border-r px-2 py-2">Wochenend</div>
              <div className="border-b border-r px-2 py-2">Ausfall</div>
              <div className="border-b border-r px-2 py-2 text-center">T</div>
              <div className="border-b border-r px-2 py-2 text-center">N</div>
              {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((val, i) => (
                <div key={i} className="border-b border-r px-2 py-1">
                  <select
                    className="w-full rounded border px-1 py-1 text-[11px]"
                    value={val ?? ""}
                    onChange={(e) => {
                      const next = e.target.value;
                      setReport((p) => {
                        const list = Array.isArray(p.workCycles) ? [...p.workCycles] : [];
                        list[i] = next;
                        return { ...p, workCycles: list };
                      });
                      if (next !== "__custom__") {
                        setCustomCycleDraft((p) => ({ ...p, [i]: "" }));
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
                    {customWorkCycles.map((c, idx) => (
                      <option key={`custom-${c}`} value={c}>{20 + idx} {c}</option>
                    ))}
                    <option value="__custom__">Eigener Takt…</option>
                  </select>
                  {val === "__custom__" ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        className="w-full rounded border px-2 py-1 text-[11px]"
                        placeholder="Eigener Takt"
                        value={customCycleDraft[i] ?? ""}
                        onChange={(e) =>
                          setCustomCycleDraft((p) => ({ ...p, [i]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="rounded border border-sky-200 bg-white px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-50"
                        onClick={() => {
                          const text = (customCycleDraft[i] ?? "").trim();
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
                          setCustomCycleDraft((p) => ({ ...p, [i]: "" }));
                        }}
                      >
                        Übernehmen
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {safeWorkers.map((w, idx) => (
              <div
                key={idx}
                className="grid w-full text-[12px]"
                style={{
                  gridTemplateColumns: `220px 80px 80px 80px 50px 50px repeat(${Math.max(
                    1,
                    (Array.isArray(report.workCycles) ? report.workCycles : []).length
                  )}, minmax(120px,1fr))`,
                }}
              >
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-[12px]" value={w.name ?? ""} onChange={(e) => setWorker(idx, { name: e.target.value })} />
                </div>
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-center text-[12px] bg-slate-50" value={w.reineArbeitsStd ?? ""} readOnly />
                </div>
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-center text-[12px]" value={w.wochenendfahrt ?? ""} onChange={(e) => setWorker(idx, { wochenendfahrt: e.target.value })} />
                </div>
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-center text-[12px]" value={w.ausfallStd ?? ""} onChange={(e) => setWorker(idx, { ausfallStd: e.target.value })} />
                </div>
                <div className="border-b border-r flex items-center justify-center">
                  <input type="checkbox" checked={!!w.ausloeseT} onChange={(e) => setWorker(idx, { ausloeseT: e.target.checked })} />
                </div>
                <div className="border-b border-r flex items-center justify-center">
                  <input type="checkbox" checked={!!w.ausloeseN} onChange={(e) => setWorker(idx, { ausloeseN: e.target.checked })} />
                </div>
                {(Array.isArray(report.workCycles) && report.workCycles.length ? report.workCycles : [""]).map((_, j) => (
                  <div key={j} className="border-b border-r px-2 py-1">
                    <input
                      className="w-full rounded border px-1 py-1 text-center text-[12px]"
                      value={(Array.isArray(w.stunden) ? w.stunden[j] : "") ?? ""}
                      onChange={(e) => {
                        const st = Array.isArray(w.stunden) ? [...w.stunden] : [];
                        while (st.length < (Array.isArray(report.workCycles) ? report.workCycles.length : 1)) st.push("");
                        st[j] = e.target.value;
                        setWorker(idx, { stunden: st });
                      }}
                      placeholder="Std."
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </GroupCard> : null}

      {/* ======================= TABELLE ======================= */}
      {showStep(5) ? <GroupCard title="Tabelle (Bohrung / Proben / Verfüllung)" badge="Kernbereich">

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
                      const rbSet = new Set(["178", "220", "273", "324", "368", "419", "509"]);
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
                      {(["GP", "KP", "SP", "WP", "BKB", "KK-LV"] as const).map((k: ProbenFlag) => (
                        <label key={k} className="flex items-center gap-2">
                          <span className="w-10 text-slate-600">{k}</span>
                          <input
                            className="w-full rounded border px-2 py-1 text-sm"
                            value={(row.probenFlags ?? []).includes(k) ? k : ""}
                            placeholder=" "
                            onChange={(e) => {
                              const flags = new Set(row.probenFlags ?? []);
                              const has = flags.has(k);
                              if (e.target.value.trim() !== "") {
                                flags.add(k);
                              } else if (has) {
                                flags.delete(k);
                              }
                              setRow(i, { probenFlags: Array.from(flags) });
                            }}
                          />
                        </label>
                      ))}
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
                        <div className="text-[11px] text-slate-500">SPT</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={row.spt ?? ""}
                          onChange={(e) => setRow(i, { spt: e.target.value })}
                          placeholder="12/30"
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

      {showStep(6) ? <GroupCard title="Verfüllung" badge="Kernbereich">
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
                    {expandedLines[`ton-${i}`] ? "– Zeile" : "+ Zeile"}
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
                    {expandedLines[`bohrgut-${i}`] ? "– Zeile" : "+ Zeile"}
                  </button>
                </div>

                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Zement-Bent.</div>
                <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-3" value={row.verfuellung?.zementBentVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: e.target.value } })} placeholder="Zement-Bent. von" />
                <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-3" value={row.verfuellung?.zementBentBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentBis: e.target.value } })} placeholder="Zement-Bent. bis" />

                <div className="lg:col-span-2 text-sm text-slate-600 self-center">Beton</div>
                <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-3" value={row.verfuellung?.betonVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: e.target.value } })} placeholder="Beton von" />
                <input className="rounded-lg border px-3 py-2 text-sm lg:col-span-3" value={row.verfuellung?.betonBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonBis: e.target.value } })} placeholder="Beton bis" />
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= UMSETZEN ======================= */}
      {showStep(1) ? <GroupCard title="Umsetzen" badge="Logistik">

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
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.von ?? ""} onChange={(e) => setUmsetzenRow(i, { von: e.target.value })} placeholder="von" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.auf ?? ""} onChange={(e) => setUmsetzenRow(i, { auf: e.target.value })} placeholder="auf" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.entfernungM ?? ""} onChange={(e) => setUmsetzenRow(i, { entfernungM: e.target.value })} placeholder="Entfernung (m)" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.zeit ?? ""} onChange={(e) => setUmsetzenRow(i, { zeit: e.target.value })} placeholder="Zeit" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.begruendung ?? ""} onChange={(e) => setUmsetzenRow(i, { begruendung: e.target.value })} placeholder="Begründung" />
                <input className="rounded-xl border p-3 lg:col-span-2" value={r.wartezeit ?? ""} onChange={(e) => setUmsetzenRow(i, { wartezeit: e.target.value })} placeholder="Wartezeiten / Veranlassung" />
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= PEGELAUSBAU ======================= */}
      {showStep(7) ? <GroupCard title="Pegelausbau" badge="Ausbau">

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
              <select
                className="rounded-xl border p-3"
                value={r.pegelDm ?? ""}
                onChange={(e) => updatePegel(i, { pegelDm: e.target.value })}
              >
                <option value="">Pegel Ø</option>
                {['2"', '3"', '4"', '5"', '6"', "DIN300", "DIN400", "DIN500", "DIN600", "DIN700", "DIN800"].map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* ROHRE (wie PDF: Sumpf, Filter, Rohre, Aufsatz PVC, Aufsatz Stahl, Filterkies) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">ROHRE</div>

              <div className="grid lg:grid-cols-6 gap-3">
                <div className="lg:col-span-6 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                    <input
                      type="checkbox"
                      checked={pegelSumpfEnabled[i] ?? Boolean(r.sumpfVon || r.sumpfBis)}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setPegelSumpfEnabled((p) => ({ ...p, [i]: next }));
                        if (!next) {
                          updatePegel(i, { sumpfVon: "", sumpfBis: "" });
                        }
                      }}
                    />
                    Sumpfrohr anzeigen
                  </label>
                </div>

                {(pegelSumpfEnabled[i] ?? Boolean(r.sumpfVon || r.sumpfBis)) ? (
                  <>
                    <input className="rounded-xl border p-3" placeholder="Sumpf von" value={r.sumpfVon} onChange={(e) => updatePegel(i, { sumpfVon: e.target.value })} />
                    <input className="rounded-xl border p-3" placeholder="Sumpf bis" value={r.sumpfBis} onChange={(e) => updatePegel(i, { sumpfBis: e.target.value })} />
                  </>
                ) : null}

                <input className="rounded-xl border p-3" placeholder="Filter von" value={r.filterVon} onChange={(e) => updatePegel(i, { filterVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Filter bis" value={r.filterBis} onChange={(e) => updatePegel(i, { filterBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Aufsatz PVC von" value={r.aufsatzPvcVon} onChange={(e) => updatePegel(i, { aufsatzPvcVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Aufsatz PVC bis" value={r.aufsatzPvcBis} onChange={(e) => updatePegel(i, { aufsatzPvcBis: e.target.value })} />

                {pegelMode !== "unterflur" ? (
                  <>
                    <input className="rounded-xl border p-3" placeholder="Aufsatz Stahl von" value={r.aufsatzStahlVon} onChange={(e) => updatePegel(i, { aufsatzStahlVon: e.target.value })} />
                    <input className="rounded-xl border p-3" placeholder="Aufsatz Stahl bis" value={r.aufsatzStahlBis} onChange={(e) => updatePegel(i, { aufsatzStahlBis: e.target.value })} />
                  </>
                ) : null}

              </div>
            </div>

            {/* DICHTUNG-VERFÜLLUNG (Ton, Sand, Zement-Bent, Bohrgut) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">DICHTUNG / VERFÜLLUNG</div>

              <div className="grid lg:grid-cols-8 gap-3">
                <input className="rounded-xl border p-3" placeholder="Ton von" value={r.tonVon} onChange={(e) => updatePegel(i, { tonVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Ton bis" value={r.tonBis} onChange={(e) => updatePegel(i, { tonBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Sand von" value={r.sandVon} onChange={(e) => updatePegel(i, { sandVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Sand bis" value={r.sandBis} onChange={(e) => updatePegel(i, { sandBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Zement-Bent. von" value={r.zementBentVon} onChange={(e) => updatePegel(i, { zementBentVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Zement-Bent. bis" value={r.zementBentBis} onChange={(e) => updatePegel(i, { zementBentBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Bohrgut von" value={r.bohrgutVon} onChange={(e) => updatePegel(i, { bohrgutVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Bohrgut bis" value={r.bohrgutBis} onChange={(e) => updatePegel(i, { bohrgutBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Filterkies von" value={r.filterkiesVon ?? ""} onChange={(e) => updatePegel(i, { filterkiesVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Filterkies bis" value={r.filterkiesBis ?? ""} onChange={(e) => updatePegel(i, { filterkiesBis: e.target.value })} />
                <input className="rounded-xl border p-3 lg:col-span-2" placeholder="Filterkies Körnung" value={r.filterkiesKoernung ?? ""} onChange={(e) => updatePegel(i, { filterkiesKoernung: e.target.value })} />
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
                      checked={r[k]}
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
          </div>
        ))}
      </GroupCard> : null}
      {/* ======================= SONSTIGE / BEMERKUNGEN / UNTERSCHRIFTEN ======================= */}
      {showStep(8) ? <GroupCard title="Sonstige / Bemerkungen / Unterschriften" badge="Abschluss">

    {/* Texte */}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <h3 className="font-medium">Sonstige Arbeiten</h3>
        <textarea
          className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
          value={report.otherWork ?? ""}
          onChange={(e) => update("otherWork", e.target.value)}
          placeholder="Sonstige Arbeiten…"
        />
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <h3 className="font-medium">Bemerkungen / Anordnungen / Besuche</h3>
        <textarea
          className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
          value={report.remarks ?? ""}
          onChange={(e) => update("remarks", e.target.value)}
          placeholder="Bemerkungen, Anordnungen, Besuche…"
        />
      </div>
    </div>

  {/* UNTERSCHRIFTEN */}
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
    </GroupCard> : null}

      {/* ======================= BUTTONS ======================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={saveDraftToLocalStorage}
          >
            Entwurf speichern (lokal)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadPdfToLocal}
          >
            PDF lokal speichern
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fillTestData}
          >
            Testdaten füllen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openTestPdf}
          >
            Vorschau
          </button>
        </div>
        {useStepper ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
            >
              Zurück
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
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
