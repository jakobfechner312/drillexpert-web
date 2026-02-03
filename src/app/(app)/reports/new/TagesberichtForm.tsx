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

const emptyTimeRow = () => ({ from: "", to: "" });

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
    abstHalter: false,
    klarpump: false,
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
      from: toHHMM(row?.from ?? ""),
      to: toHHMM(row?.to ?? ""),
    }));
  }

  if (Array.isArray(r.breakRows)) {
    r.breakRows = r.breakRows.map((row) => ({
      ...row,
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
export default function TagesberichtForm({ projectId, reportId, mode = "create", stepper = false }: TagesberichtFormProps) {
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
  const useStepper = stepper;
  const steps = useMemo(
    () => [
      { key: "stammdaten", title: "Stammdaten" },
      { key: "fahrzeuge", title: "Fahrzeuge / Transport / Umsetzen" },
      { key: "wetter", title: "Wetter + Ruhewasser" },
      { key: "zeiten", title: "Arbeitszeit & Pausen" },
      { key: "arbeitsakte", title: "Arbeitsakte / Stunden" },
      { key: "tabelle", title: "Tabelle Bohrungen" },
      { key: "pegel", title: "Pegelausbau" },
      { key: "abschluss", title: "Bemerkungen & Unterschriften" },
    ],
    []
  );
  const [stepIndex, setStepIndex] = useState(0);
   // ✅ hält immer den aktuellsten Report
  const reportRef = useRef(report);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

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

  function addWorkTimeRow() {
    setReport((p) => {
      const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
      if (rows.length >= 2) return p;
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
      if (rows.length >= 2) return p;
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
      if (workRows.length >= 2 || breakRows.length >= 2) return p;
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
      dailyReportNo: "TB-001",
      vehicles: "LKW 7.5t, Bohrgerät X2, Sprinter",
      aNr: "A-2026-001",
      device: "Bohrgerät BG-12",
      trailer: "Anhänger 2t",
      workTimeRows: [
        { from: "07:00", to: "12:00" },
        { from: "12:30", to: "16:30" },
      ],
      breakRows: [
        { from: "09:30", to: "09:45" },
        { from: "12:00", to: "12:30" },
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
      workCycles: ["Bohren", "Verrohren", "Verfüllen"],
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
        stunden: Array(16)
          .fill("")
          .map((_, j) => (j % (i + 2) === 0 ? "1" : "")),
      })),
      umsetzenRows: Array.from({ length: 5 }, (_, i) => ({
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
        abstHalter: i % 2 === 0,
        klarpump: i % 3 === 2,
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
  const MAX_UMSETZEN_ROWS = 5;
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
  const safeTransport = Array.isArray(report.transportRows) && report.transportRows.length
    ? report.transportRows
    : [emptyTransportRow()];

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
      rows.push(emptyTransportRow());
      return { ...p, transportRows: rows.length ? rows : [emptyTransportRow()] };
    });
  }

  function removeLastTransportRow() {
    setReport((p) => {
      const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [emptyTransportRow()];
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
    | "abstHalter"
    | "klarpump";

  const pegelBoolFields: Array<[PegelBooleanKey, string]> = [
    ["sebaKap", "Seba Kap."],
    ["boKap", "Bo Kap."],
    ["hydrKap", "Hydr. Kap."],
    ["fernGask", "Fern-Gask."],
    ["passavant", "Passavant"],
    ["betonSockel", "Betonsockel"],
    ["abstHalter", "Abst.-Halter"],
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
            <div className="flex gap-2">
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
      {/* ======================= KOPF (PDF-LAYOUT) ======================= */}
      {showHeaderBlock ? (
        <GroupCard title="Tagesbericht" badge="Kopfbereich">
          {(!useStepper || showStep(0)) ? (
            <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Nr.
                <input
                  className="w-40 rounded-xl border px-3 py-2 text-sm bg-white"
                  value={report.dailyReportNo ?? ""}
                  onChange={(e) => update("dailyReportNo", e.target.value)}
                  placeholder="TB-001"
                />
              </label>
            </div>
          ) : null}
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
                      <div className="flex gap-2">
                        <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-sky-700 hover:bg-sky-50" onClick={addWorkAndBreakRow}>+ Zeile</button>
                        <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-sky-700 hover:bg-sky-50" onClick={removeLastWorkAndBreakRow}>– Zeile</button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                        <div className="text-sm font-medium text-slate-700">Arbeitszeit</div>
                        <div className="mt-2 space-y-3">
                          {safeWorkTimes.slice(0, 2).map((r, i) => (
                            <div key={i} className="grid grid-cols-2 gap-3">
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.from ?? ""} onChange={(e) => setWorkTimeRow(i, { from: e.target.value })} />
                              <input type="time" className="w-full min-w-[104px] rounded-lg border px-2.5 py-2 text-sm" value={r.to ?? ""} onChange={(e) => setWorkTimeRow(i, { to: e.target.value })} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white p-3">
                        <div className="text-sm font-medium text-slate-700">Pausen</div>
                        <div className="mt-2 space-y-3">
                          {safeBreaks.slice(0, 2).map((r, i) => (
                            <div key={i} className="grid grid-cols-2 gap-3">
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
                      <div className="flex gap-2">
                        <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-sky-700 hover:bg-sky-50" onClick={addTransportRow}>+ Zeile</button>
                        <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-sky-700 hover:bg-sky-50" onClick={removeLastTransportRow}>– Zeile</button>
                      </div>
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
                    <h3 className="font-medium">Ruhewasser / Entfernung</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="min-h-[32px] text-sm leading-4 text-slate-600">Ruhewasser (m)</span>
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
                        <span className="min-h-[32px] text-sm leading-4 text-slate-600">Entfernung (km)</span>
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
      {showStep(4) ? <GroupCard title="Arbeitsakte / Stunden" badge="Personal">
        <div className="flex gap-2">
          <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50" onClick={addWorker}>+ Arbeiter</button>
          <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50" onClick={removeLastWorker}>– Arbeiter</button>
          <span className="text-sm text-slate-500 self-center">Arbeiter: {safeWorkers.length}</span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border">
          <div className="min-w-[840px] w-full">
            <div className="grid w-full grid-cols-[220px_80px_80px_80px_50px_50px_repeat(16,minmax(32px,1fr))] border-b text-[12px] font-medium text-slate-600">
              <div className="border-b border-r px-2 py-2">Name</div>
              <div className="border-b border-r px-2 py-2">Reine Std.</div>
              <div className="border-b border-r px-2 py-2">Wochenend</div>
              <div className="border-b border-r px-2 py-2">Ausfall</div>
              <div className="border-b border-r px-2 py-2 text-center">T</div>
              <div className="border-b border-r px-2 py-2 text-center">N</div>
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="border-b border-r px-1 py-2 text-center">{i + 1}</div>
              ))}
            </div>

            {safeWorkers.map((w, idx) => (
              <div
                key={idx}
                className="grid w-full grid-cols-[220px_80px_80px_80px_50px_50px_repeat(16,minmax(32px,1fr))] text-[12px]"
              >
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-[12px]" value={w.name ?? ""} onChange={(e) => setWorker(idx, { name: e.target.value })} />
                </div>
                <div className="border-b border-r px-2 py-1">
                  <input className="w-full rounded border px-2 py-1 text-center text-[12px]" value={w.reineArbeitsStd ?? ""} onChange={(e) => setWorker(idx, { reineArbeitsStd: e.target.value })} />
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
                {(Array.isArray(w.stunden) ? w.stunden : Array(16).fill("")).slice(0, 16).map((val, j) => (
                  <div key={j} className="border-b border-r px-1 py-1">
                    <input
                      className="w-full rounded border px-1 py-1 text-center text-[12px]"
                      value={val ?? ""}
                      onChange={(e) => {
                        const st = Array.isArray(w.stunden) ? [...w.stunden] : Array(16).fill("");
                        st[j] = e.target.value;
                        setWorker(idx, { stunden: st });
                      }}
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

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            onClick={addRow}
            disabled={safeTableRows.length >= MAX_TABLE_ROWS}
          >
            + Zeile
          </button>
          <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50" onClick={removeLastRow}>– Zeile</button>
          <span className="text-sm text-slate-500 self-center">
            Zeilen: {safeTableRows.length} / {MAX_TABLE_ROWS}
          </span>
        </div>

        <div className="mt-4 space-y-4">
          {safeTableRows.map((row, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="grid gap-3 md:grid-cols-8">
                <input className="rounded-xl border p-3" value={row.boNr ?? ""} onChange={(e) => setRow(i, { boNr: e.target.value })} placeholder="Bo. Nr." />
                <input className="rounded-xl border p-3" value={row.gebohrtVon ?? ""} onChange={(e) => setRow(i, { gebohrtVon: e.target.value })} placeholder="gebohrt von" />
                <input className="rounded-xl border p-3" value={row.gebohrtBis ?? ""} onChange={(e) => setRow(i, { gebohrtBis: e.target.value })} placeholder="gebohrt bis" />
                <input className="rounded-xl border p-3" value={row.verrohrtVon ?? ""} onChange={(e) => setRow(i, { verrohrtVon: e.target.value })} placeholder="verrohrt von" />
                <input className="rounded-xl border p-3" value={row.verrohrtBis ?? ""} onChange={(e) => setRow(i, { verrohrtBis: e.target.value })} placeholder="verrohrt bis" />

                <div className="rounded-xl border p-3 flex flex-col gap-2">
                  {(["RB", "EK", "DK", "S"] as const).map((k: VerrohrtFlag) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(row.verrohrtFlags ?? []).includes(k)}
                        onChange={(e) => {
                          const flags = new Set(row.verrohrtFlags ?? []);
                          e.target.checked ? flags.add(k) : flags.delete(k);
                          setRow(i, { verrohrtFlags: Array.from(flags) });
                        }}
                      />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>

                <input className="rounded-xl border p-3" value={row.vollbohrVon ?? ""} onChange={(e) => setRow(i, { vollbohrVon: e.target.value })} placeholder="Vollbohrung bis" />
                <input className="rounded-xl border p-3" value={row.vollbohrBis ?? ""} onChange={(e) => setRow(i, { vollbohrBis: e.target.value })} placeholder="Vollbohr. Durchmesser" />

                <input className="rounded-xl border p-3" value={row.hindernisVon ?? ""} onChange={(e) => setRow(i, { hindernisVon: e.target.value })} placeholder="Hindernisse von" />
                <input className="rounded-xl border p-3" value={row.hindernisBis ?? ""} onChange={(e) => setRow(i, { hindernisBis: e.target.value })} placeholder="Hindernisse bis" />
                <input className="rounded-xl border p-3" value={row.hindernisZeit ?? ""} onChange={(e) => setRow(i, { hindernisZeit: e.target.value })} placeholder="Hindernisse Zeit" />

                <input className="rounded-xl border p-3" value={row.schachtenVon ?? ""} onChange={(e) => setRow(i, { schachtenVon: e.target.value })} placeholder="Schachten von" />
                <input className="rounded-xl border p-3" value={row.schachtenBis ?? ""} onChange={(e) => setRow(i, { schachtenBis: e.target.value })} placeholder="Schachten bis" />
                <input className="rounded-xl border p-3" value={row.schachtenZeit ?? ""} onChange={(e) => setRow(i, { schachtenZeit: e.target.value })} placeholder="Schachten Zeit" />

                <div className="rounded-xl border p-3 flex flex-col gap-2">
                  {(["GP", "KP", "SP", "WP", "BKB", "KK-LV"] as const).map((k: ProbenFlag) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(row.probenFlags ?? []).includes(k)}
                        onChange={(e) => {
                          const flags = new Set(row.probenFlags ?? []);
                          e.target.checked ? flags.add(k) : flags.delete(k);
                          setRow(i, { probenFlags: Array.from(flags) });
                        }}
                      />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>

                <input className="rounded-xl border p-3" value={row.spt ?? ""} onChange={(e) => setRow(i, { spt: e.target.value })} placeholder="SPT" />
              </div>

              <div className="md:col-span-6 rounded-xl border p-3 mt-3">
                <div className="text-sm font-medium mb-3">Verfüllung</div>
                <div className="grid gap-3 md:grid-cols-8">
                  <div className="md:col-span-2 text-sm text-slate-600 self-center">Ton</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.tonVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonVon: e.target.value } })} placeholder="Ton von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.tonBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonBis: e.target.value } })} placeholder="Ton bis" />

                  <div className="md:col-span-2 text-sm text-slate-600 self-center">Bohrgut</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.bohrgutVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutVon: e.target.value } })} placeholder="Bohrgut von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.bohrgutBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutBis: e.target.value } })} placeholder="Bohrgut bis" />

                  <div className="md:col-span-2 text-sm text-slate-600 self-center">Zement-Bent.</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.zementBentVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: e.target.value } })} placeholder="Zement-Bent. von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.zementBentBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentBis: e.target.value } })} placeholder="Zement-Bent. bis" />

                  <div className="md:col-span-2 text-sm text-slate-600 self-center">Beton</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.betonVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: e.target.value } })} placeholder="Beton von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.betonBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonBis: e.target.value } })} placeholder="Beton bis" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= UMSETZEN ======================= */}
      {showStep(1) ? <GroupCard title="Umsetzen" badge="Logistik">

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            onClick={addUmsetzenRow}
            disabled={safeUmsetzen.length >= MAX_UMSETZEN_ROWS}
          >
            + Zeile
          </button>
          <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50" onClick={removeLastUmsetzenRow}>– Zeile</button>
          <span className="text-sm text-slate-500 self-center">
            Zeilen: {safeUmsetzen.length} / {MAX_UMSETZEN_ROWS}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {safeUmsetzen.map((r, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="grid gap-3 md:grid-cols-12">
                <input className="rounded-xl border p-3 md:col-span-2" value={r.von ?? ""} onChange={(e) => setUmsetzenRow(i, { von: e.target.value })} placeholder="von" />
                <input className="rounded-xl border p-3 md:col-span-2" value={r.auf ?? ""} onChange={(e) => setUmsetzenRow(i, { auf: e.target.value })} placeholder="auf" />
                <input className="rounded-xl border p-3 md:col-span-2" value={r.entfernungM ?? ""} onChange={(e) => setUmsetzenRow(i, { entfernungM: e.target.value })} placeholder="Entfernung (m)" />
                <input className="rounded-xl border p-3 md:col-span-2" value={r.zeit ?? ""} onChange={(e) => setUmsetzenRow(i, { zeit: e.target.value })} placeholder="Zeit" />
                <input className="rounded-xl border p-3 md:col-span-2" value={r.begruendung ?? ""} onChange={(e) => setUmsetzenRow(i, { begruendung: e.target.value })} placeholder="Begründung" />
                <input className="rounded-xl border p-3 md:col-span-2" value={r.wartezeit ?? ""} onChange={(e) => setUmsetzenRow(i, { wartezeit: e.target.value })} placeholder="Wartezeiten / Veranlassung" />
              </div>
            </div>
          ))}
        </div>
      </GroupCard> : null}

      {/* ======================= PEGELAUSBAU ======================= */}
      {showStep(6) ? <GroupCard title="Pegelausbau" badge="Ausbau">

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            onClick={addPegelRow}
            disabled={safePegel.length >= MAX_PEGEL_ROWS}
          >
            + Zeile
          </button>
          <button type="button" className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-700 hover:bg-sky-50" onClick={removeLastPegelRow}>– Zeile</button>
          <span className="text-sm text-slate-500 self-center">
            Zeilen: {safePegel.length} / {MAX_PEGEL_ROWS}
          </span>
        </div>

        {safePegel.map((r, i) => (
          <div key={i} className="mt-4 rounded-xl border p-4 space-y-5">
            {/* Kopf */}
            <div className="grid md:grid-cols-4 gap-3">
              <input className="rounded-xl border p-3" placeholder="Bohr Nr." value={r.bohrNr} onChange={(e) => updatePegel(i, { bohrNr: e.target.value })} />
              <input className="rounded-xl border p-3" placeholder="Pegel Ø" value={r.pegelDm} onChange={(e) => updatePegel(i, { pegelDm: e.target.value })} />
            </div>

            {/* ROHRE (wie PDF: Sumpf, Filter, Rohre, Aufsatz PVC, Aufsatz Stahl, Filterkies) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">ROHRE</div>

              <div className="grid md:grid-cols-6 gap-3">
                <input className="rounded-xl border p-3" placeholder="Sumpf von" value={r.sumpfVon} onChange={(e) => updatePegel(i, { sumpfVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Sumpf bis" value={r.sumpfBis} onChange={(e) => updatePegel(i, { sumpfBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Filter von" value={r.filterVon} onChange={(e) => updatePegel(i, { filterVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Filter bis" value={r.filterBis} onChange={(e) => updatePegel(i, { filterBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Aufsatz PVC von" value={r.aufsatzPvcVon} onChange={(e) => updatePegel(i, { aufsatzPvcVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Aufsatz PVC bis" value={r.aufsatzPvcBis} onChange={(e) => updatePegel(i, { aufsatzPvcBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Aufsatz Stahl von" value={r.aufsatzStahlVon} onChange={(e) => updatePegel(i, { aufsatzStahlVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Aufsatz Stahl bis" value={r.aufsatzStahlBis} onChange={(e) => updatePegel(i, { aufsatzStahlBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Filterkies von" value={r.filterkiesVon} onChange={(e) => updatePegel(i, { filterkiesVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Filterkies bis" value={r.filterkiesBis} onChange={(e) => updatePegel(i, { filterkiesBis: e.target.value })} />
              </div>
            </div>

            {/* DICHTUNG-VERFÜLLUNG (Ton, Sand, Zement-Bent, Bohrgut) */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">DICHTUNG / VERFÜLLUNG</div>

              <div className="grid md:grid-cols-8 gap-3">
                <input className="rounded-xl border p-3" placeholder="Ton von" value={r.tonVon} onChange={(e) => updatePegel(i, { tonVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Ton bis" value={r.tonBis} onChange={(e) => updatePegel(i, { tonBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Sand von" value={r.sandVon} onChange={(e) => updatePegel(i, { sandVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Sand bis" value={r.sandBis} onChange={(e) => updatePegel(i, { sandBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Zement-Bent. von" value={r.zementBentVon} onChange={(e) => updatePegel(i, { zementBentVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Zement-Bent. bis" value={r.zementBentBis} onChange={(e) => updatePegel(i, { zementBentBis: e.target.value })} />

                <input className="rounded-xl border p-3" placeholder="Bohrgut von" value={r.bohrgutVon} onChange={(e) => updatePegel(i, { bohrgutVon: e.target.value })} />
                <input className="rounded-xl border p-3" placeholder="Bohrgut bis" value={r.bohrgutBis} onChange={(e) => updatePegel(i, { bohrgutBis: e.target.value })} />
              </div>
            </div>

            {/* VERSCHLÜSSE */}
            <div className="rounded-xl border p-4">
              <div className="font-medium mb-3">VERSCHLÜSSE</div>

              <div className="grid md:grid-cols-4 gap-3">
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
              </div>
            </div>
          </div>
        ))}
      </GroupCard> : null}
      {/* ======================= SONSTIGE / BEMERKUNGEN / UNTERSCHRIFTEN ======================= */}
      {showStep(7) ? <GroupCard title="Sonstige / Bemerkungen / Unterschriften" badge="Abschluss">

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
          <h3 className="font-medium">
            Unterschrift Auftraggeber / Bauleitung
          </h3>

          <input
            className="mt-3 w-full rounded-xl border p-3"
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

          <div className="mt-3 rounded-xl border bg-white">
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
      <div className="flex flex-col gap-3 sm:flex-row">
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
          PDF testen
        </button>
      </div>

      <pre className="rounded-2xl bg-gray-50 p-4 text-xs overflow-auto">
        {JSON.stringify(report, null, 2)}
      </pre>
    </div>
  );
}
