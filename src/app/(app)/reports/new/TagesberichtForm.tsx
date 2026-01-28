"use client";

import { createClient } from "@/lib/supabase/browser";
import { useDraftActions } from "@/components/DraftActions";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";

import type {
  Tagesbericht,
  TableRow,
  VerrohrtFlag,
  ProbenFlag,
  UmsetzenRow,
  WorkerRow,
  PegelAusbauRow,
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
};



export default function TagesberichtForm({ projectId }: TagesberichtFormProps) {

  const savingRef = useRef(false);
  const reportSaveKeyRef = useRef<string | null>(null);
  
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
    setLocalProjectId(proj.id);
    setNewProjectName("");
    setProjectModalOpen(false);
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
   // ✅ hält immer den aktuellsten Report
  const reportRef = useRef(report);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  // ================== DRAFT + REPORT SAVE HANDLERS ==================
  const { setSaveDraftHandler, setSaveReportHandler } = useDraftActions();

  useEffect(() => {
    console.log("[Form] register save handlers");
    const supabase = createClient();

    // ✅ Draft speichern
    setSaveDraftHandler(async () => {
      console.log("[Form] saveDraft START");

      const { data: userRes } = await supabase.auth.getUser();
      console.log("[Form] getUser done", { userErr, hasUser: !!userRes?.user });

      const user = userRes.user;
      if (!user) return alert("Nicht eingeloggt.");

      console.log("[Form] requireProjectId START", { effectiveProjectId });
      const pid = await requireProjectId();
      console.log("[Form] requireProjectId DONE", { pid });

      if (!pid) return; // Modal ist offen -> User muss erst Projekt wählen/anlegen

      const currentReport = reportRef.current;
      console.log("[Form] inserting draft…");

      const title =
        currentReport?.project?.trim()
          ? `Tagesbericht – ${currentReport.project} (${currentReport.date})`
          : `Tagesbericht Entwurf (${currentReport?.date ?? ""})`;

      const { error } = await supabase.from("drafts").insert({
        user_id: user.id,
        project_id: pid, // ✅ NIE null
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

        const pid = await requireProjectId();
        if (!pid) return;

        // ✅ DB-seitig: gleicher Key für denselben Save-Vorgang
        if (!reportSaveKeyRef.current) {
          reportSaveKeyRef.current = crypto.randomUUID();
        }
        const idempotencyKey = reportSaveKeyRef.current;

        const currentReport = reportRef.current;

        const title =
          currentReport?.project?.trim()
            ? `Tagesbericht – ${currentReport.project} (${currentReport.date})`
            : `Tagesbericht (${currentReport?.date ?? ""})`;

        const { error } = await supabase.from("reports").insert({
          user_id: user.id,
          project_id: pid,
          report_type: "tagesbericht",
          title,
          data: currentReport,
          status: "final",
          idempotency_key: idempotencyKey, // ✅ WICHTIG
        });

        if (error) {
          // ✅ wenn DB sagt "gibt’s schon" -> ok
          if ((error as any).code === "23505") {
            alert("Bericht war schon gespeichert ✅");
            return;
          }
          console.error(error);
          return alert("Bericht speichern fehlgeschlagen: " + error.message);
        }

        // ✅ bei Erfolg: Key resetten, damit nächstes Absenden wieder neu ist
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
  }, [setSaveDraftHandler, setSaveReportHandler, requireProjectId]);
  // ========================================================

  const sigClientRef = useRef<SignatureCanvas>(null);
  const sigDrillerRef = useRef<SignatureCanvas>(null);

  const saveSignatureToState = () => {
    const clientPng = sigClientRef.current?.isEmpty()
      ? ""
      : sigClientRef.current?.getTrimmedCanvas().toDataURL("image/png");

    const drillerPng = sigDrillerRef.current?.isEmpty()
      ? ""
      : sigDrillerRef.current?.getTrimmedCanvas().toDataURL("image/png");

    setReport((p: any) => ({
      ...p,
      signatures: {
        ...(p.signatures ?? { clientOrManagerName: "", drillerName: "" }),
        clientOrManagerSigPng: clientPng || "",
        drillerSigPng: drillerPng || "",
      },
    }));
  };

  const clearClientSig = () => {
    sigClientRef.current?.clear();
    saveSignatureToState();
  };

  const clearDrillerSig = () => {
    sigDrillerRef.current?.clear();
    saveSignatureToState();
  };

  function update<K extends keyof Tagesbericht>(key: K, value: Tagesbericht[K]) {
    setReport((prev) => ({ ...prev, [key]: value }));
  }
  const safeWorkTimes = Array.isArray((report as any).workTimeRows) && (report as any).workTimeRows.length
  ? ((report as any).workTimeRows as any[])
  : [emptyTimeRow()];

const safeBreaks = Array.isArray((report as any).breakRows) && (report as any).breakRows.length
  ? ((report as any).breakRows as any[])
  : [emptyTimeRow()];

function setWorkTimeRow(i: number, patch: any) {
  setReport((p: any) => {
    const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
    rows[i] = { ...rows[i], ...patch };
    return { ...p, workTimeRows: rows };
  });
}

function addWorkTimeRow() {
  setReport((p: any) => {
    const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
    if (rows.length >= 2) return p;
    rows.push(emptyTimeRow());
    return { ...p, workTimeRows: rows };
  });
}

function removeLastWorkTimeRow() {
  setReport((p: any) => {
    const rows = Array.isArray(p.workTimeRows) ? [...p.workTimeRows] : [emptyTimeRow()];
    if (rows.length <= 1) return p;
    rows.pop();
    return { ...p, workTimeRows: rows };
  });
}

function setBreakRow(i: number, patch: any) {
  setReport((p: any) => {
    const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
    rows[i] = { ...rows[i], ...patch };
    return { ...p, breakRows: rows };
  });
}

function addBreakRow() {
  setReport((p: any) => {
    const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
    if (rows.length >= 2) return p;
    rows.push(emptyTimeRow());
    return { ...p, breakRows: rows };
  });
}

function removeLastBreakRow() {
  setReport((p: any) => {
    const rows = Array.isArray(p.breakRows) ? [...p.breakRows] : [emptyTimeRow()];
    if (rows.length <= 1) return p;
    rows.pop();
    return { ...p, breakRows: rows };
  });
}

  function saveDraftToLocalStorage() {
    localStorage.setItem("tagesbericht_draft", JSON.stringify(report));
    alert("Entwurf lokal gespeichert ✅");
  }

  async function openTestPdf() {
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
  const safeTransport = Array.isArray((report as any).transportRows)
  ? ((report as any).transportRows as any[])
  : [emptyTransportRow()];

    function setTransportRow(i: number, patch: any) {
    setReport((p: any) => {
        const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [emptyTransportRow()];
        rows[i] = { ...rows[i], ...patch };
        return { ...p, transportRows: rows };
    });
    }

    function addTransportRow() {
    setReport((p: any) => {
        const rows = Array.isArray(p.transportRows) ? [...p.transportRows] : [];
        rows.push(emptyTransportRow());
        return { ...p, transportRows: rows.length ? rows : [emptyTransportRow()] };
    });
    }

    function removeLastTransportRow() {
    setReport((p: any) => {
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

  return (
    <div className="mt-6 space-y-6 max-w-7xl mx-auto px-4">
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Projekt auswählen</h3>
              <button
                type="button"
                className="rounded-xl border px-3 py-2"
                onClick={() => setProjectModalOpen(false)}
              >
                Schließen
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
                    className="rounded-xl border px-3 py-2 disabled:opacity-50"
                    disabled={creatingProject}
                    onClick={createProject}
                  >
                    {creatingProject ? "Erstelle…" : "+ Anlegen"}
                  </button>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  Legt das Projekt an und wählt es automatisch aus.
                </p>
              </div>

              {/* 🔹 PROJEKT-LISTE */}
              {projectUiLoading ? (
                <p className="text-sm text-gray-600">Lade Projekte…</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-gray-600">Noch keine Projekte vorhanden.</p>
              ) : (
                <div className="space-y-2">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full rounded-xl border px-3 py-3 text-left hover:bg-gray-50"
                      onClick={() => {
                        setLocalProjectId(p.id);
                        setProjectModalOpen(false);
                      }}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ======================= KOPF ======================= */}
      <section className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">Kopf</h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* LINKS */}
          <section className="rounded-2xl border p-4">
            <h3 className="text-lg font-semibold">Allgemein</h3>

            <div className="mt-4 grid gap-4">
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Datum</span>
                <input
                  type="date"
                  className="w-full rounded-xl border p-3"
                  value={report.date ?? ""}
                  onChange={(e) => update("date", e.target.value as any)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Projekt</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={report.project ?? ""}
                  onChange={(e) => update("project", e.target.value as any)}
                  placeholder="z.B. Baustelle Freiburg Nord"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">Auftraggeber</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={report.client ?? ""}
                  onChange={(e) => update("client", e.target.value as any)}
                  placeholder="z.B. Stadt Freiburg"
                />
              </label>
            </div>
          </section>

          {/* RECHTS */}
          <section className="rounded-2xl border p-4">
            <h3 className="text-lg font-semibold">Oben rechts</h3>
            <p className="mt-1 text-sm text-gray-600">Fahrzeuge / A.Nr. / Gerät + Arbeitszeit & Pausen</p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm text-gray-600">Fahrzeuge</span>
                <input className="w-full rounded-xl border p-3" value={report.vehicles ?? ""} onChange={(e) => update("vehicles", e.target.value as any)} />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">A.Nr.</span>
                <input className="w-full rounded-xl border p-3" value={report.aNr ?? ""} onChange={(e) => update("aNr", e.target.value as any)} />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-gray-600">Gerät</span>
                <input className="w-full rounded-xl border p-3" value={report.device ?? ""} onChange={(e) => update("device", e.target.value as any)} />
              </label>
            </div>

           <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
                <h4 className="font-medium">Arbeitszeit</h4>
                <div className="flex gap-2">
                <button type="button" className="rounded-xl border px-3 py-2" onClick={addWorkTimeRow}>+ Zeile</button>
                <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastWorkTimeRow}>– Zeile</button>
                </div>
            </div>

            <div className="mt-3 space-y-3">
                {safeWorkTimes.slice(0, 2).map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                    <input type="time" className="w-full rounded-xl border p-3"
                    value={r.from ?? ""} onChange={(e) => setWorkTimeRow(i, { from: e.target.value })} />
                    <input type="time" className="w-full rounded-xl border p-3"
                    value={r.to ?? ""} onChange={(e) => setWorkTimeRow(i, { to: e.target.value })} />
                </div>
                ))}
            </div>
            </div>
            <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
                <h4 className="font-medium">Pausen</h4>
                <div className="flex gap-2">
                <button type="button" className="rounded-xl border px-3 py-2" onClick={addBreakRow}>+ Zeile</button>
                <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastBreakRow}>– Zeile</button>
                </div>
            </div>

            <div className="mt-3 space-y-3">
                {safeBreaks.slice(0, 2).map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                    <input type="time" className="w-full rounded-xl border p-3"
                    value={r.from ?? ""} onChange={(e) => setBreakRow(i, { from: e.target.value })} />
                    <input type="time" className="w-full rounded-xl border p-3"
                    value={r.to ?? ""} onChange={(e) => setBreakRow(i, { to: e.target.value })} />
                </div>
                ))}
            </div>
            </div>
          </section>
        </div>
      </section>
      {/* ======================= WETTER + TRANSPORT ======================= */}
    <section className="rounded-2xl border p-4">
    <h2 className="text-lg font-semibold">Wetter / Transport</h2>

    {/* Wetter */}
    <div className="mt-4 rounded-xl border p-4">
        <h3 className="font-medium">Wetter</h3>

        <div className="mt-3 flex flex-wrap gap-4">
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
            <span className="text-sm text-gray-600">Temp. Max (°C)</span>
            <input
            className="w-full rounded-xl border p-3"
            inputMode="numeric"
            value={report.weather?.tempMaxC ?? ""}
            onChange={(e) =>
                setReport((p) => ({
                ...p,
                weather: {
                    ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                    tempMaxC: e.target.value === "" ? null : Number(e.target.value),
                },
                }))
            }
            placeholder="z.B. 12"
            />
        </label>

        <label className="space-y-1">
            <span className="text-sm text-gray-600">Temp. Min (°C)</span>
            <input
            className="w-full rounded-xl border p-3"
            inputMode="numeric"
            value={report.weather?.tempMinC ?? ""}
            onChange={(e) =>
                setReport((p) => ({
                ...p,
                weather: {
                    ...(p.weather ?? { conditions: [], tempMaxC: null, tempMinC: null }),
                    tempMinC: e.target.value === "" ? null : Number(e.target.value),
                },
                }))
            }
            placeholder="z.B. -1"
            />
        </label>
        </div>
    </div>
    </section>
            {/* Ruhewasser / Entfernung */}
<div className="mt-4 rounded-xl border p-4">
  <h3 className="font-medium">Ruhewasser / Entfernung</h3>

  <div className="mt-3 grid gap-4 md:grid-cols-3">
    {/* Ruhewasser vor Arbeitsbeginn */}
    <label className="space-y-1">
      <span className="text-sm text-gray-600">
        Ruhewasser vor Arbeitsbeginn (m)
      </span>
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
        placeholder="z. B. 2.4"
      />
    </label>

    {/* Entfernung Wohnwagen / Baustelle (km) */}
    <label className="space-y-1">
      <span className="text-sm text-gray-600">
        Entfernung Wohnwagen / Baustelle (km)
      </span>
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
        placeholder="z. B. 12"
      />
    </label>

    {/* Zeit */}
        <label className="space-y-1">
        <span className="text-sm text-gray-600">Zeit</span>
        <input
            className="w-full rounded-xl border p-3"
            value={report.entfernungWohnwagenBaustelleZeit ?? ""}
            onChange={(e) =>
            update("entfernungWohnwagenBaustelleZeit", e.target.value)
            }
            placeholder="z. B. 00:20"
        />
        </label>
    </div>
    </div>


    {/* Transport (ausklappbar) */}
    <section className="mt-4 rounded-2xl border p-4">
    <div className="flex items-center justify-between gap-3">
        <div>
        <h3 className="font-medium">Transport</h3>
        <p className="mt-1 text-sm text-gray-600">von → nach, km, Zeit</p>
        </div>

        <div className="flex gap-2">
        <button type="button" className="rounded-xl border px-3 py-2" onClick={addTransportRow}>
            + Zeile
        </button>
        <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastTransportRow}>
            – Zeile
        </button>
        </div>
    </div>

    <div className="mt-4 space-y-3">
        {safeTransport.map((r, i) => (
        <div key={i} className="grid gap-3 md:grid-cols-4">
            <input
            className="rounded-xl border p-3"
            value={r.from ?? ""}
            onChange={(e) => setTransportRow(i, { from: e.target.value })}
            placeholder="von"
            />
            <input
            className="rounded-xl border p-3"
            value={r.to ?? ""}
            onChange={(e) => setTransportRow(i, { to: e.target.value })}
            placeholder="nach"
            />
            <input
            className="rounded-xl border p-3"
            value={r.km ?? ""}
            onChange={(e) => setTransportRow(i, { km: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="km"
            />
            <input
            className="rounded-xl border p-3"
            value={r.time ?? ""}
            onChange={(e) => setTransportRow(i, { time: e.target.value })}
            placeholder="Zeit"
            />
        </div>
        ))}
    </div>
    </section>

      {/* ======================= ARBEITER ======================= */}
      <section className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">Arbeiter / Arbeitsakte</h2>

        <div className="mt-3 flex gap-3">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={addWorker}>+ Arbeiter</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastWorker}>– Arbeiter</button>
          <span className="text-sm text-gray-500 self-center">Arbeiter: {safeWorkers.length}</span>
        </div>

        <div className="mt-4 space-y-4">
          {safeWorkers.map((w, idx) => (
            <div key={idx} className="rounded-xl border p-4">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <label className="space-y-1">
                    <span className="text-sm text-gray-600">Name</span>
                    <input className="w-full rounded-xl border p-3" value={w.name ?? ""} onChange={(e) => setWorker(idx, { name: e.target.value })} />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="space-y-1">
                    <span className="text-sm text-gray-600">Reine Arbeits Std.</span>
                    <input className="w-full rounded-xl border p-3" value={w.reineArbeitsStd ?? ""} onChange={(e) => setWorker(idx, { reineArbeitsStd: e.target.value })} />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="space-y-1">
                    <span className="text-sm text-gray-600">Wochenendfahrt</span>
                    <input className="w-full rounded-xl border p-3" value={w.wochenendfahrt ?? ""} onChange={(e) => setWorker(idx, { wochenendfahrt: e.target.value })} />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="space-y-1">
                    <span className="text-sm text-gray-600">Ausfall Std.</span>
                    <input className="w-full rounded-xl border p-3" value={w.ausfallStd ?? ""} onChange={(e) => setWorker(idx, { ausfallStd: e.target.value })} />
                  </label>
                </div>

                {/* ✅ Auslöse: nur T / N */}
                <div className="md:col-span-1 rounded-xl border p-3">
                <div className="text-sm text-gray-600 mb-2">Auslöse</div>

                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!w.ausloeseT}
                        onChange={(e) =>
                        setWorker(idx, { ausloeseT: e.target.checked })
                        }
                    />
                    <span>T</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!w.ausloeseN}
                        onChange={(e) =>
                        setWorker(idx, { ausloeseN: e.target.checked })
                        }
                    />
                    <span>N</span>
                    </label>
                </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border p-3">
                <div className="text-sm text-gray-600 mb-2">Arbeitstakt/Stunden (Kästchen)</div>
                <div className="grid gap-2 grid-cols-8 md:grid-cols-16">
                  {(Array.isArray(w.stunden) ? w.stunden : Array(16).fill("")).slice(0, 16).map((val, j) => (
                    <input
                      key={j}
                      className="rounded-lg border p-2 text-center"
                      value={val ?? ""}
                      onChange={(e) => {
                        const st = Array.isArray(w.stunden) ? [...w.stunden] : Array(16).fill("");
                        st[j] = e.target.value;
                        setWorker(idx, { stunden: st });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================= TABELLE ======================= */}
      <section className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">Tabelle (Bohrung / Proben / Verfüllung)</h2>

        <div className="mt-3 flex gap-3">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={addRow}>+ Zeile</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastRow}>– Zeile</button>
          <span className="text-sm text-gray-500 self-center">Zeilen: {safeTableRows.length}</span>
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
                  <div className="md:col-span-2 text-sm text-gray-600 self-center">Ton</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.tonVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonVon: e.target.value } })} placeholder="Ton von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.tonBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), tonBis: e.target.value } })} placeholder="Ton bis" />

                  <div className="md:col-span-2 text-sm text-gray-600 self-center">Bohrgut</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.bohrgutVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutVon: e.target.value } })} placeholder="Bohrgut von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.bohrgutBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), bohrgutBis: e.target.value } })} placeholder="Bohrgut bis" />

                  <div className="md:col-span-2 text-sm text-gray-600 self-center">Zement-Bent.</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.zementBentVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentVon: e.target.value } })} placeholder="Zement-Bent. von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.zementBentBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), zementBentBis: e.target.value } })} placeholder="Zement-Bent. bis" />

                  <div className="md:col-span-2 text-sm text-gray-600 self-center">Beton</div>
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.betonVon ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonVon: e.target.value } })} placeholder="Beton von" />
                  <input className="rounded-xl border p-3 md:col-span-3" value={row.verfuellung?.betonBis ?? ""} onChange={(e) => setRow(i, { verfuellung: { ...(row.verfuellung ?? {}), betonBis: e.target.value } })} placeholder="Beton bis" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================= UMSETZEN ======================= */}
      <section className="rounded-2xl border p-4 mt-4">
        <h2 className="text-lg font-semibold">Umsetzen</h2>

        <div className="mt-3 flex gap-3">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={addUmsetzenRow}>+ Zeile</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastUmsetzenRow}>– Zeile</button>
          <span className="text-sm text-gray-500 self-center">Zeilen: {safeUmsetzen.length}</span>
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
      </section>

      {/* ======================= PEGELAUSBAU ======================= */}
      <section className="rounded-2xl border p-4 mt-6">
        <h2 className="text-lg font-semibold">Pegelausbau</h2>

        <div className="mt-3 flex gap-3">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={addPegelRow}>+ Zeile</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={removeLastPegelRow}>– Zeile</button>
          <span className="text-sm text-gray-500 self-center">Zeilen: {safePegel.length}</span>
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
                {[
                  ["sebaKap", "Seba Kap."],
                  ["boKap", "Bo Kap."],
                  ["hydrKap", "Hydr. Kap."],
                  ["fernGask", "Fern-Gask."],
                  ["passavant", "Passavant"],
                  ["betonSockel", "Betonsockel"],
                  ["abstHalter", "Abst.-Halter"],
                  ["klarpump", "Klarpump."],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!(r as any)[k]}
                      onChange={(e) => updatePegel(i, { [k]: e.target.checked } as any)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>
      {/* ======================= SONSTIGE / BEMERKUNGEN / UNTERSCHRIFTEN ======================= */}
      <section className="rounded-2xl border p-4 mt-6">
    <h2 className="text-lg font-semibold">
      Sonstige / Bemerkungen / Unterschriften
    </h2>

    {/* Texte */}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border p-4">
        <h3 className="font-medium">Sonstige Arbeiten</h3>
        <textarea
          className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
          value={report.otherWork ?? ""}
          onChange={(e) => update("otherWork", e.target.value as any)}
          placeholder="Sonstige Arbeiten…"
        />
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="font-medium">Bemerkungen / Anordnungen / Besuche</h3>
        <textarea
          className="mt-3 w-full rounded-xl border p-3 min-h-[160px]"
          value={report.remarks ?? ""}
          onChange={(e) => update("remarks", e.target.value as any)}
          placeholder="Bemerkungen, Anordnungen, Besuche…"
        />
      </div>
    </div>

  {/* UNTERSCHRIFTEN */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Auftraggeber */}
        <div className="rounded-2xl border p-4">
          <h3 className="font-medium">
            Unterschrift Auftraggeber / Bauleitung
          </h3>

          <input
            className="mt-3 w-full rounded-xl border p-3"
            value={report.signatures?.clientOrManagerName ?? ""}
            onChange={(e) =>
              setReport((p: any) => ({
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
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={clearClientSig}
            >
              Löschen
            </button>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={saveSignatureToState}
            >
              Übernehmen
            </button>
          </div>
        </div>

        {/* Bohrmeister */}
        <div className="rounded-2xl border p-4">
          <h3 className="font-medium">Unterschrift Bohrmeister</h3>

          <input
            className="mt-3 w-full rounded-xl border p-3"
            value={report.signatures?.drillerName ?? ""}
            onChange={(e) =>
              setReport((p: any) => ({
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
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={clearDrillerSig}
            >
              Löschen
            </button>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={saveSignatureToState}
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </section>

      {/* ======================= BUTTONS ======================= */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="rounded-2xl border px-4 py-3 font-medium" onClick={saveDraftToLocalStorage}>
          Entwurf speichern (lokal)
        </button>
        <button type="button" className="rounded-2xl border px-4 py-3 font-medium" onClick={openTestPdf}>
          PDF testen
        </button>
      </div>

      <pre className="rounded-2xl bg-gray-50 p-4 text-xs overflow-auto">{JSON.stringify(report, null, 2)}</pre>
    </div>
  );
}