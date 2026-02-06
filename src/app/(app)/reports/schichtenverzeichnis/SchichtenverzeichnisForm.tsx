"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useDraftActions } from "@/components/DraftActions";

type FormData = Record<string, string>;
type SchichtRow = {
  ansatzpunkt_bis: string;
  a1: string;
  a2: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f: string;
  g: string;
  h: string;
  feststellungen: string;
  proben_art: string;
  proben_nr: string;
  proben_tiefe: string;
  proben_tiefen: string[];
};

type GroundwaterRow = {
  grundwasserstand: string;
  datum: string;
  uhrzeit: string;
  tiefe_m: string;
  uk_verrohrg: string;
  bohrtiefe: string;
};

const MAX_FESTSTELLUNGEN_CHARS = 200;

const initialData: FormData = {
  auftrag_nr: "",
  bohrmeister: "",
  blatt_nr: "",
  projekt_name: "",
  bohrung_nr: "",
  durchfuehrungszeit: "",
  rammbohrung: "",
  rotationskernbohrung: "",
  ek_dks: "",
  verrohrt_bis_1: "",
  verrohr_durch_1: "",
  verrohrt_bis_2: "",
  verrohr_durch_2: "",
  verrohrt_bis_3: "",
  verrohr_durch_3: "",
  hoehe_ansatzpunkt: "",
  bezogen_auf: "",
  gitterwert: "",
  gitterwert_rechts: "",
  gitterwert_links: "",
  eingemessen_durch: "",
  grundwasserstand: "",
  datum: "",
  uhrzeit: "",
  tiefe_m: "",
  uk_verrohrg: "",
  bohrtiefe: "",
  pegel_durchmesser: "",
  rok: "",
  passavant: "",
  ferngas: "",
  seba: "",
  sumpf: "",
  filter_rohr: "",
  sw: "",
  vollrohr_pvc: "",
  vollrohr_stahl: "",
  hydr_kp: "",
  betonsockel: "",
  filterkies_von: "",
  filterkies_bis: "",
  tondichtung_von: "",
  tondichtung_bis: "",
  gegenfilter_von: "",
  gegenfilter_bis: "",
  tondichtung_von_2: "",
  tondichtung_bis_2: "",
  zement_bent_von: "",
  zement_bent_bis: "",
  bohrgut_von: "",
  bohrgut_bis: "",
  probe_gp: "",
  probe_kp: "",
  probe_sp: "",
  probe_wp: "",
  probe_ki: "",
  probe_bkb: "",
  probe_spt: "",
  uebergeben_am: "",
  uebergeben_an: "",
  schicht_a1: "",
  schicht_a2: "",
  schicht_b: "",
  schicht_c: "",
  schicht_d: "",
  schicht_e: "",
  schicht_f: "",
  schicht_g: "",
  schicht_h: "",
  feststellungen: "",
  proben_art: "",
  proben_nr: "",
  proben_tiefe: "",
};

const emptySchichtRow = (): SchichtRow => ({
  ansatzpunkt_bis: "",
  a1: "",
  a2: "",
  b: "",
  c: "",
  d: "",
  e: "",
  f: "",
  g: "",
  h: "",
  feststellungen: "",
  proben_art: "",
  proben_nr: "",
  proben_tiefe: "",
  proben_tiefen: ["", "", ""],
});

const emptyGroundwaterRow = (): GroundwaterRow => ({
  grundwasserstand: "",
  datum: "",
  uhrzeit: "",
  tiefe_m: "",
  uk_verrohrg: "",
  bohrtiefe: "",
});

type SchichtenverzeichnisFormProps = {
  projectId?: string;
  reportId?: string;
  mode?: "create" | "edit";
  stepper?: boolean;
};

export default function SchichtenverzeichnisForm({
  projectId,
  reportId,
  mode = "create",
  stepper = false,
}: SchichtenverzeichnisFormProps) {
  type SaveScope = "unset" | "project" | "my_reports";

  const savingRef = useRef(false);
  const reportSaveKeyRef = useRef<string | null>(null);

  const [saveScope, setSaveScope] = useState<SaveScope>(projectId ? "project" : "unset");
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);
  const effectiveProjectId = projectId ?? localProjectId;

  const pendingSaveResolveRef = useRef<
    ((v: { scope: SaveScope; projectId: string | null } | undefined) => void) | null
  >(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectUiLoading, setProjectUiLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [data, setData] = useState<FormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [schichtRows, setSchichtRows] = useState<SchichtRow[]>([
    emptySchichtRow(),
  ]);
  const [grundwasserRows, setGrundwasserRows] = useState<GroundwaterRow[]>([
    emptyGroundwaterRow(),
  ]);
  const [schichtRowHeight, setSchichtRowHeight] = useState("87");
  const [schichtStartOffsetPage1, setSchichtStartOffsetPage1] = useState("0");
  const [schichtStartOffsetPage2, setSchichtStartOffsetPage2] = useState("365");
  const [schichtXOffsetPage1, setSchichtXOffsetPage1] = useState("0");
  const [schichtXOffsetPage2, setSchichtXOffsetPage2] = useState("0");
  const [schichtRowsPerPage1, setSchichtRowsPerPage1] = useState("4");
  const [schichtRowsPerPage2, setSchichtRowsPerPage2] = useState("8");
  const [schichtRowOffsetsPage2, setSchichtRowOffsetsPage2] = useState<string[]>(
    ["0", "5", "10", "12", "15", "19", "22", "23"]
  );
  const [showGrid, setShowGrid] = useState(false);
  const [gridStep, setGridStep] = useState("50");
  const [schichtXOffsetsPage1, setSchichtXOffsetsPage1] = useState({
    ansatzpunkt_bis: "0",
    a1: "-5",
    a2: "-5",
    b: "0",
    c: "3",
    d: "0",
    e: "0",
    f: "0",
    g: "3",
    h: "0",
    feststellungen: "0",
    proben_art: "0",
    proben_nr: "0",
    proben_tiefe: "0",
  });
  const [schichtXOffsetsPage2, setSchichtXOffsetsPage2] = useState({
    ansatzpunkt_bis: "0",
    a1: "-20",
    a2: "-20",
    b: "-10",
    c: "-5",
    d: "-15",
    e: "-15",
    f: "-10",
    g: "-5",
    h: "-15",
    feststellungen: "-20",
    proben_art: "0",
    proben_nr: "0",
    proben_tiefe: "0",
  });
  const useStepper = stepper;
  const steps = useMemo(
    () => [
      { key: "kopf", title: "Kopf & Projekt" },
      { key: "bohrung", title: "Bohrung / Verrohrung" },
      { key: "ansatzpunkt", title: "Ansatzpunkt & Gitter" },
      { key: "grundwasser", title: "Grundwasserstände" },
      { key: "pegel", title: "Pegelrohr / Ausbau" },
      { key: "filter", title: "Filter / Dichtung / Bohrgut" },
      { key: "schicht", title: "Schichtbeschreibung" },
      { key: "proben", title: "Proben & Übergabe" },
    ],
    []
  );
  const [stepIndex, setStepIndex] = useState(0);

  const supabase = useMemo(() => createClient(), []);
  const { setSaveDraftHandler, setSaveReportHandler } = useDraftActions();

  const loadMyProjects = useCallback(async () => {
    setProjectUiLoading(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user) {
      setProjectUiLoading(false);
      alert("Nicht eingeloggt.");
      return;
    }

    const { data: projData, error } = await supabase
      .from("projects")
      .select("id,name")
      .order("created_at", { ascending: false });

    setProjectUiLoading(false);

    if (error) {
      console.error(error);
      alert("Projekte laden fehlgeschlagen: " + error.message);
      return;
    }

    setProjects((projData ?? []) as { id: string; name: string }[]);
  }, [supabase]);

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
    const name = newProjectName.trim();
    if (!name) return alert("Bitte Projektnamen eingeben.");

    setCreatingProject(true);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      setCreatingProject(false);
      return alert("Nicht eingeloggt.");
    }

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

    setProjects((prev) => [{ id: proj.id, name: proj.name }, ...prev]);
    setSaveScope("project");
    setLocalProjectId(proj.id);
    setNewProjectName("");
    setProjectModalOpen(false);

    pendingSaveResolveRef.current?.({ scope: "project", projectId: proj.id });
    pendingSaveResolveRef.current = null;

    setCreatingProject(false);
  }, [newProjectName, supabase]);

  // ======================
  // LOAD REPORT (EDIT MODE)
  // ======================
  useEffect(() => {
    if (mode !== "edit" || !reportId) return;

    const load = async () => {
      const { data: row, error } = await supabase
        .from("reports")
        .select("data")
        .eq("id", reportId)
        .single();

      if (error || !row?.data) {
        console.error(error);
        alert("Bericht konnte nicht geladen werden");
        return;
      }

      const db = row.data as Record<string, any>;
      setData((prev) => ({ ...prev, ...(db ?? {}) }));
      setSchichtRows(Array.isArray(db?.schicht_rows) && db.schicht_rows.length ? db.schicht_rows : [emptySchichtRow()]);
      setGrundwasserRows(Array.isArray(db?.grundwasser_rows) && db.grundwasser_rows.length ? db.grundwasser_rows : [emptyGroundwaterRow()]);

      if (db?.schicht_row_height != null) setSchichtRowHeight(String(db.schicht_row_height));
      if (db?.schicht_start_offset_page_1 != null) setSchichtStartOffsetPage1(String(db.schicht_start_offset_page_1));
      if (db?.schicht_start_offset_page_2 != null) setSchichtStartOffsetPage2(String(db.schicht_start_offset_page_2));
      if (db?.schicht_x_offset_page_1 != null) setSchichtXOffsetPage1(String(db.schicht_x_offset_page_1));
      if (db?.schicht_x_offset_page_2 != null) setSchichtXOffsetPage2(String(db.schicht_x_offset_page_2));
      if (db?.schicht_rows_per_page_1 != null) setSchichtRowsPerPage1(String(db.schicht_rows_per_page_1));
      if (db?.schicht_rows_per_page_2 != null) setSchichtRowsPerPage2(String(db.schicht_rows_per_page_2));
      if (db?.schicht_x_offsets_page_1 != null) setSchichtXOffsetsPage1((prev) => ({ ...prev, ...db.schicht_x_offsets_page_1 }));
      if (db?.schicht_x_offsets_page_2 != null) setSchichtXOffsetsPage2((prev) => ({ ...prev, ...db.schicht_x_offsets_page_2 }));
      if (db?.schicht_row_offsets_page_2 != null && Array.isArray(db.schicht_row_offsets_page_2)) {
        setSchichtRowOffsetsPage2(db.schicht_row_offsets_page_2.map((v: number | string) => String(v ?? "0")));
      }
    };

    load();
  }, [mode, reportId, supabase]);

  useEffect(() => {
    setSaveDraftHandler(null);
    setSaveReportHandler(async () => {
      if (savingRef.current) return;
      savingRef.current = true;

      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return alert("Nicht eingeloggt.");

        const target = await ensureSaveTarget();
        if (!target) return;
        const { scope, projectId } = target;

        if (!reportSaveKeyRef.current) {
          reportSaveKeyRef.current = crypto.randomUUID();
        }

        const title =
          data.projekt_name?.trim()
            ? `Schichtenverzeichnis – ${data.projekt_name}${data.datum ? ` (${data.datum})` : ""}`
            : `Schichtenverzeichnis (${data.datum ?? ""})`;

        const reportData = {
          ...data,
          grundwasser_rows: grundwasserRows,
          schicht_rows: schichtRows,
          schicht_row_height: Number(schichtRowHeight) || 200,
          schicht_start_offset_page_1: Number(schichtStartOffsetPage1) || 0,
          schicht_start_offset_page_2: Number(schichtStartOffsetPage2) || 0,
          schicht_x_offset_page_1: Number(schichtXOffsetPage1) || 0,
          schicht_x_offset_page_2: Number(schichtXOffsetPage2) || 0,
          schicht_rows_per_page: Number(schichtRowsPerPage1) || 4,
          schicht_rows_per_page_1: Number(schichtRowsPerPage1) || 4,
          schicht_rows_per_page_2: Number(schichtRowsPerPage2) || 8,
          schicht_x_offsets_page_1: Object.fromEntries(
            Object.entries(schichtXOffsetsPage1).map(([k, v]) => [k, Number(v) || 0])
          ),
          schicht_x_offsets_page_2: Object.fromEntries(
            Object.entries(schichtXOffsetsPage2).map(([k, v]) => [k, Number(v) || 0])
          ),
          schicht_row_offsets_page_2: schichtRowOffsetsPage2.map((v) => Number(v) || 0),
        };

        if (mode === "edit") {
          if (!reportId) {
            alert("Fehler: reportId fehlt im Edit-Modus");
            return;
          }

          const { error } = await supabase
            .from("reports")
            .update({
              title,
              data: reportData,
              status: "final",
              project_id: scope === "project" ? projectId : null,
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

        const payload = {
          user_id: user.id,
          project_id: scope === "project" ? projectId : null,
          report_type: "schichtenverzeichnis",
          title,
          data: reportData,
          status: "final",
          idempotency_key: reportSaveKeyRef.current,
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
      setSaveDraftHandler(null);
      setSaveReportHandler(null);
    };
  }, [
    data,
    grundwasserRows,
    schichtRows,
    schichtRowHeight,
    schichtStartOffsetPage1,
    schichtStartOffsetPage2,
    schichtXOffsetPage1,
    schichtXOffsetPage2,
    schichtRowsPerPage1,
    schichtRowsPerPage2,
    schichtXOffsetsPage1,
    schichtXOffsetsPage2,
    schichtRowOffsetsPage2,
    ensureSaveTarget,
    setSaveDraftHandler,
    setSaveReportHandler,
    supabase,
    mode,
    reportId,
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sv_offsets");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.rowHeight != null) setSchichtRowHeight(String(saved.rowHeight));
      if (saved.startY1 != null) setSchichtStartOffsetPage1(String(saved.startY1));
      if (saved.startY2 != null) setSchichtStartOffsetPage2(String(saved.startY2));
      if (saved.startX1 != null) setSchichtXOffsetPage1(String(saved.startX1));
      if (saved.startX2 != null) setSchichtXOffsetPage2(String(saved.startX2));
      if (saved.rowsPerPage1 != null) setSchichtRowsPerPage1(String(saved.rowsPerPage1));
      if (saved.rowsPerPage2 != null) setSchichtRowsPerPage2(String(saved.rowsPerPage2));
      if (saved.rowsPerPage != null) {
        setSchichtRowsPerPage1(String(saved.rowsPerPage));
        setSchichtRowsPerPage2(String(saved.rowsPerPage));
      }
      if (saved.xOffsetsPage1 != null) {
        setSchichtXOffsetsPage1((prev) => ({ ...prev, ...saved.xOffsetsPage1 }));
      }
      if (saved.xOffsetsPage2 != null) {
        setSchichtXOffsetsPage2((prev) => ({ ...prev, ...saved.xOffsetsPage2 }));
      }
      if (saved.xOffsets != null && saved.xOffsetsPage2 == null) {
        setSchichtXOffsetsPage2((prev) => ({ ...prev, ...saved.xOffsets }));
      }
      if (saved.rowOffsetsPage2 != null && Array.isArray(saved.rowOffsetsPage2)) {
        setSchichtRowOffsetsPage2(
          saved.rowOffsetsPage2.map((v: number | string) => String(v ?? "0"))
        );
      }
      if (saved.gridStep != null) setGridStep(String(saved.gridStep));
      if (typeof saved.showGrid === "boolean") setShowGrid(saved.showGrid);
      if (saved.xOffsets != null) {
        setSchichtXOffsetsPage1((prev) => ({ ...prev, ...saved.xOffsets }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "sv_offsets",
        JSON.stringify({
          rowHeight: Number(schichtRowHeight) || 95,
          startY1: Number(schichtStartOffsetPage1) || 0,
          startY2: Number(schichtStartOffsetPage2) || 0,
          startX1: Number(schichtXOffsetPage1) || 0,
          startX2: Number(schichtXOffsetPage2) || 0,
          rowsPerPage1: Number(schichtRowsPerPage1) || 4,
          rowsPerPage2: Number(schichtRowsPerPage2) || 8,
          xOffsetsPage1: schichtXOffsetsPage1,
          xOffsetsPage2: schichtXOffsetsPage2,
          rowOffsetsPage2: schichtRowOffsetsPage2,
          gridStep: Number(gridStep) || 50,
          showGrid,
        })
      );
    } catch {
      // ignore
    }
  }, [
    schichtRowHeight,
    schichtStartOffsetPage1,
    schichtStartOffsetPage2,
    schichtXOffsetPage1,
    schichtXOffsetPage2,
    schichtRowsPerPage1,
    schichtRowsPerPage2,
    schichtXOffsetsPage1,
    schichtXOffsetsPage2,
    schichtRowOffsetsPage2,
    gridStep,
    showGrid,
  ]);

  const restoreOffsetsFromBackup = () => {
    try {
      const raw =
        localStorage.getItem("sv_offsets_backup") ||
        localStorage.getItem("sv_offsets_history");
      if (!raw) {
        alert("Kein Backup gefunden.");
        return;
      }
      const saved =
        raw.trim().startsWith("[") ?
          JSON.parse(raw).slice(-1)[0] :
          JSON.parse(raw);
      if (!saved) {
        alert("Backup ist leer.");
        return;
      }
      localStorage.setItem("sv_offsets", JSON.stringify(saved));
      if (saved.rowHeight != null) setSchichtRowHeight(String(saved.rowHeight));
      if (saved.startY1 != null) setSchichtStartOffsetPage1(String(saved.startY1));
      if (saved.startY2 != null) setSchichtStartOffsetPage2(String(saved.startY2));
      if (saved.startX1 != null) setSchichtXOffsetPage1(String(saved.startX1));
      if (saved.startX2 != null) setSchichtXOffsetPage2(String(saved.startX2));
      if (saved.rowsPerPage1 != null) setSchichtRowsPerPage1(String(saved.rowsPerPage1));
      if (saved.rowsPerPage2 != null) setSchichtRowsPerPage2(String(saved.rowsPerPage2));
      if (saved.rowsPerPage != null) {
        setSchichtRowsPerPage1(String(saved.rowsPerPage));
        setSchichtRowsPerPage2(String(saved.rowsPerPage));
      }
      if (saved.xOffsetsPage1 != null) {
        setSchichtXOffsetsPage1((prev) => ({ ...prev, ...saved.xOffsetsPage1 }));
      }
      if (saved.xOffsetsPage2 != null) {
        setSchichtXOffsetsPage2((prev) => ({ ...prev, ...saved.xOffsetsPage2 }));
      }
      if (saved.xOffsets != null) {
        setSchichtXOffsetsPage1((prev) => ({ ...prev, ...saved.xOffsets }));
        setSchichtXOffsetsPage2((prev) => ({ ...prev, ...saved.xOffsets }));
      }
      if (saved.rowOffsetsPage2 != null && Array.isArray(saved.rowOffsetsPage2)) {
        setSchichtRowOffsetsPage2(
          saved.rowOffsetsPage2.map((v: number | string) => String(v ?? "0"))
        );
      }
      if (saved.gridStep != null) setGridStep(String(saved.gridStep));
      if (typeof saved.showGrid === "boolean") setShowGrid(saved.showGrid);
      alert("Backup wiederhergestellt ✅");
    } catch {
      alert("Backup konnte nicht geladen werden.");
    }
  };

  const buildOffsetsSnapshot = () => ({
    rowHeight: Number(schichtRowHeight) || 95,
    startY1: Number(schichtStartOffsetPage1) || 0,
    startY2: Number(schichtStartOffsetPage2) || 0,
    startX1: Number(schichtXOffsetPage1) || 0,
    startX2: Number(schichtXOffsetPage2) || 0,
    rowsPerPage1: Number(schichtRowsPerPage1) || 4,
    rowsPerPage2: Number(schichtRowsPerPage2) || 8,
    xOffsetsPage1: schichtXOffsetsPage1,
    xOffsetsPage2: schichtXOffsetsPage2,
    rowOffsetsPage2: schichtRowOffsetsPage2,
    gridStep: Number(gridStep) || 50,
    showGrid,
    savedAt: new Date().toISOString(),
  });

  const saveOffsetsSnapshot = () => {
    try {
      const snapshot = buildOffsetsSnapshot();
      const current = localStorage.getItem("sv_offsets");
      if (current) localStorage.setItem("sv_offsets_backup", current);
      localStorage.setItem("sv_offsets", JSON.stringify(snapshot));
      const historyRaw = localStorage.getItem("sv_offsets_history");
      const parsedHistory = historyRaw ? JSON.parse(historyRaw) : null;
      const history = Array.isArray(parsedHistory) ? (parsedHistory as any[]) : [];
      history.push(snapshot);
      localStorage.setItem("sv_offsets_history", JSON.stringify(history.slice(-20)));
    } catch {
      // ignore
    }
  };

  const update = (key: keyof FormData, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const openPdf = async () => {
    setLoading(true);
    try {
      saveOffsetsSnapshot();
      const params = new URLSearchParams();
      if (showGrid) params.set("debug", "1");
      if (Number(gridStep)) params.set("grid", String(Number(gridStep)));
      const payload = {
        ...data,
        grundwasser_rows: grundwasserRows,
        schicht_rows: schichtRows,
        schicht_row_height: Number(schichtRowHeight) || 200,
        schicht_start_offset_page_1: Number(schichtStartOffsetPage1) || 0,
        schicht_start_offset_page_2: Number(schichtStartOffsetPage2) || 0,
        schicht_x_offset_page_1: Number(schichtXOffsetPage1) || 0,
        schicht_x_offset_page_2: Number(schichtXOffsetPage2) || 0,
        schicht_rows_per_page: Number(schichtRowsPerPage1) || 4,
        schicht_rows_per_page_1: Number(schichtRowsPerPage1) || 4,
        schicht_rows_per_page_2: Number(schichtRowsPerPage2) || 8,
        schicht_x_offsets_page_1: Object.fromEntries(
          Object.entries(schichtXOffsetsPage1).map(([k, v]) => [k, Number(v) || 0])
        ),
        schicht_x_offsets_page_2: Object.fromEntries(
          Object.entries(schichtXOffsetsPage2).map(([k, v]) => [k, Number(v) || 0])
        ),
        schicht_row_offsets_page_2: schichtRowOffsetsPage2.map((v) => Number(v) || 0),
      };
      const res = await fetch(`/api/pdf/schichtenverzeichnis?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("PDF-API Fehler");
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdfToLocal = async () => {
    setLoading(true);
    try {
      saveOffsetsSnapshot();
      const params = new URLSearchParams();
      if (showGrid) params.set("debug", "1");
      if (Number(gridStep)) params.set("grid", String(Number(gridStep)));
      const payload = {
        ...data,
        grundwasser_rows: grundwasserRows,
        schicht_rows: schichtRows,
        schicht_row_height: Number(schichtRowHeight) || 200,
        schicht_start_offset_page_1: Number(schichtStartOffsetPage1) || 0,
        schicht_start_offset_page_2: Number(schichtStartOffsetPage2) || 0,
        schicht_x_offset_page_1: Number(schichtXOffsetPage1) || 0,
        schicht_x_offset_page_2: Number(schichtXOffsetPage2) || 0,
        schicht_rows_per_page: Number(schichtRowsPerPage1) || 4,
        schicht_rows_per_page_1: Number(schichtRowsPerPage1) || 4,
        schicht_rows_per_page_2: Number(schichtRowsPerPage2) || 8,
        schicht_x_offsets_page_1: Object.fromEntries(
          Object.entries(schichtXOffsetsPage1).map(([k, v]) => [k, Number(v) || 0])
        ),
        schicht_x_offsets_page_2: Object.fromEntries(
          Object.entries(schichtXOffsetsPage2).map(([k, v]) => [k, Number(v) || 0])
        ),
        schicht_row_offsets_page_2: schichtRowOffsetsPage2.map((v) => Number(v) || 0),
      };

      const res = await fetch(`/api/pdf/schichtenverzeichnis?${params.toString()}`, {
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
        data?.projekt_name?.trim()
          ? `schichtenverzeichnis-${data.projekt_name}-${data.datum ?? ""}`
          : `schichtenverzeichnis-${data?.datum ?? "draft"}`;
      const safeName = nameBase.replace(/[^a-z0-9-_]+/gi, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const fillTestData = () => {
    setData({
      ...data,
      auftrag_nr: "DE-2026-001",
      bohrmeister: "Max Mustermann",
      blatt_nr: "1",
      projekt_name: "Baustelle Freiburg Nord",
      bohrung_nr: "B-12",
      durchfuehrungszeit: "07:00–17:00",
      rammbohrung: "12,5",
      rotationskernbohrung: "38,0",
      ek_dks: "DN80",
      verrohrt_bis_1: "10,0",
      verrohr_durch_1: "140",
      verrohrt_bis_2: "20,0",
      verrohr_durch_2: "115",
      verrohrt_bis_3: "30,0",
      verrohr_durch_3: "90",
      hoehe_ansatzpunkt: "312,45",
      bezogen_auf: "NN",
      gitterwert: "H 124",
      gitterwert_rechts: "R 23",
      gitterwert_links: "L 18",
      eingemessen_durch: "JF",
      grundwasserstand: "",
      datum: "",
      uhrzeit: "",
      tiefe_m: "",
      uk_verrohrg: "",
      bohrtiefe: "",
      pegel_durchmesser: "DN100",
      rok: "0,45",
      passavant: "x",
      ferngas: "x",
      seba: "x",
      sumpf: "1,20",
      filter_rohr: "9,80",
      sw: "0,30",
      vollrohr_pvc: "6,00",
      vollrohr_stahl: "4,00",
      hydr_kp: "x",
      betonsockel: "x",
      filterkies_von: "9,50",
      filterkies_bis: "12,00",
      tondichtung_von: "2,00",
      tondichtung_bis: "3,50",
      gegenfilter_von: "3,50",
      gegenfilter_bis: "6,00",
      tondichtung_von_2: "6,00",
      tondichtung_bis_2: "7,50",
      zement_bent_von: "7,50",
      zement_bent_bis: "9,00",
      bohrgut_von: "9,00",
      bohrgut_bis: "42,00",
      probe_gp: "x",
      probe_kp: "",
      probe_sp: "x",
      probe_wp: "",
      probe_ki: "x",
      probe_bkb: "",
      probe_spt: "x",
      uebergeben_am: "30.01.2026",
      uebergeben_an: "Labor X",
    });

    const maxRows = Math.max(1, Number(schichtRowsPerPage1) + Number(schichtRowsPerPage2));
    setGrundwasserRows(
      Array.from({ length: 4 }, (_, idx) => ({
        ...emptyGroundwaterRow(),
        grundwasserstand: (2.4 + idx * 0.2).toFixed(2),
        datum: "30.01.2026",
        uhrzeit: "10:30",
        tiefe_m: (3.2 + idx * 0.4).toFixed(2),
        uk_verrohrg: (8.5 + idx * 0.5).toFixed(2),
        bohrtiefe: (42 + idx * 1.5).toFixed(2),
      }))
    );

    setSchichtRows(
      Array.from({ length: maxRows }, (_, idx) => ({
        ...emptySchichtRow(),
        ansatzpunkt_bis: `${(idx + 1) * 0.5}`,
        a1: `a1 Beispiel ${idx + 1}`,
        a2: `a2 Beispiel ${idx + 1}`,
        b: "b",
        c: "c",
        d: "d",
        e: "e",
        f: "f",
        g: "g",
        h: "h",
        feststellungen: "Feststellung: keine Besonderheiten.",
        proben_art: "GP",
        proben_nr: `P-${idx + 1}`,
        proben_tiefe: "3,2",
        proben_tiefen: ["0,0 - 2,3", "3,2", "4,1 - 5,0"],
      }))
    );
      };

  const showStep = (index: number) => !useStepper || stepIndex === index;
  const containerClass = useStepper
    ? "mt-6 space-y-6 max-w-[2000px] mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16 text-slate-900 min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 rounded-3xl border border-slate-200/60 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]"
    : "space-y-6";
  const renderStep = (content: React.ReactNode) => content;

  return (
    <div className={containerClass}>
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Schichtenverzeichnis
          </h1>
          <p className="text-sm text-slate-600">
            Professionelles Formular, layoutnah zum Original – Seite 1.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            Raster
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Schritt
            <input
              className="w-14 rounded-md border border-slate-200 px-2 py-1 text-xs"
              value={gridStep}
              onChange={(e) => setGridStep(e.target.value)}
            />
          </label>
        </div>
      </header>

      {showStep(0)
        ? renderStep(
            <Card title="Kopf & Projekt">
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_0.6fr]">
                <Field label="Auftrag‑Nr." value={data.auftrag_nr} onChange={(v) => update("auftrag_nr", v)} />
                <Field label="Bohrmeister" value={data.bohrmeister} onChange={(v) => update("bohrmeister", v)} />
                <Field label="Blatt" value={data.blatt_nr} onChange={(v) => update("blatt_nr", v)} />
                <Field
                  label="Projekt"
                  value={data.projekt_name}
                  onChange={(v) => update("projekt_name", v)}
                  className="md:col-span-3"
                />
              </div>
            </Card>
          )
        : null}

      {showStep(1)
        ? renderStep(
            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card title="Bohrung / Verfahren">
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <Field label="Bohrung Nr." value={data.bohrung_nr} onChange={(v) => update("bohrung_nr", v)} />
                    <Field label="Durchführungszeit" value={data.durchfuehrungszeit} onChange={(v) => update("durchfuehrungszeit", v)} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                    <Field label="Rammkernbohrung bis (m)" value={data.rammbohrung} onChange={(v) => update("rammbohrung", v)} />
                    <Field label="Ø" value={data.verrohr_durch_1} onChange={(v) => update("verrohr_durch_1", v)} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                    <Field
                      label="Rotationskernbohrung bis (m)"
                      value={data.rotationskernbohrung}
                      onChange={(v) => update("rotationskernbohrung", v)}
                    />
                    <Field label="Ø" value={data.verrohr_durch_2} onChange={(v) => update("verrohr_durch_2", v)} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                    <Field label="EK‑DK‑S (Ø)" value={data.ek_dks} onChange={(v) => update("ek_dks", v)} />
                    <Field label="Ø" value={data.verrohr_durch_3} onChange={(v) => update("verrohr_durch_3", v)} />
                  </div>
                </div>
              </Card>

              <Card title="Verrohrung">
                <div className="grid gap-3">
                  <div className="grid grid-cols-[1fr_90px] gap-3">
                    <Field label="Verrohrt bis (m)" value={data.verrohrt_bis_1} onChange={(v) => update("verrohrt_bis_1", v)} />
                    <Field label="Ø (mm)" value={data.verrohr_durch_1} onChange={(v) => update("verrohr_durch_1", v)} />
                  </div>
                  <div className="grid grid-cols-[1fr_90px] gap-3">
                    <Field label="Verrohrt bis (m)" value={data.verrohrt_bis_2} onChange={(v) => update("verrohrt_bis_2", v)} />
                    <Field label="Ø (mm)" value={data.verrohr_durch_2} onChange={(v) => update("verrohr_durch_2", v)} />
                  </div>
                  <div className="grid grid-cols-[1fr_90px] gap-3">
                    <Field label="Verrohrt bis (m)" value={data.verrohrt_bis_3} onChange={(v) => update("verrohrt_bis_3", v)} />
                    <Field label="Ø (mm)" value={data.verrohr_durch_3} onChange={(v) => update("verrohr_durch_3", v)} />
                  </div>
                </div>
              </Card>
            </section>
          )
        : null}

      {showStep(2)
        ? renderStep(
            <Card title="Ansatzpunkt & Gitter">
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr]">
                <Field
                  label="Höhe des Ansatzpunktes (NN)"
                  value={data.hoehe_ansatzpunkt}
                  onChange={(v) => update("hoehe_ansatzpunkt", v)}
                />
                <Field label="Bezogen auf" value={data.bezogen_auf} onChange={(v) => update("bezogen_auf", v)} />
                <Field
                  label="Eingemessen durch"
                  value={data.eingemessen_durch}
                  onChange={(v) => update("eingemessen_durch", v)}
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_0.8fr_0.8fr]">
                <Field
                  label="Gitterwert (Rechts)"
                  value={data.gitterwert_rechts}
                  onChange={(v) => update("gitterwert_rechts", v)}
                />
                <Field
                  label="Gitterwert (Links)"
                  value={data.gitterwert_links}
                  onChange={(v) => update("gitterwert_links", v)}
                />
                <Field label="Gitterwert (Hoch)" value={data.gitterwert} onChange={(v) => update("gitterwert", v)} />
              </div>
            </Card>
          )
        : null}

      {showStep(3)
        ? renderStep(
            <Card title="Grundwasserstände">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">Max. 4 Zeilen</div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              onClick={() =>
                setGrundwasserRows((prev) =>
                  prev.length >= 4 ? prev : [...prev, emptyGroundwaterRow()]
                )
              }
              disabled={grundwasserRows.length >= 4}
            >
              + Zeile
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              onClick={() =>
                setGrundwasserRows((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
              }
              disabled={grundwasserRows.length <= 1}
            >
              – Zeile
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {grundwasserRows.map((row, idx) => (
            <div key={idx} className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr]">
              <Field
                label="Grundwasserstand"
                value={row.grundwasserstand}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], grundwasserstand: v };
                    return next;
                  })
                }
              />
              <Field
                label="Datum"
                value={row.datum}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], datum: v };
                    return next;
                  })
                }
              />
              <Field
                label="Uhrzeit"
                value={row.uhrzeit}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], uhrzeit: v };
                    return next;
                  })
                }
              />
              <Field
                label="Tiefe (m)"
                value={row.tiefe_m}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], tiefe_m: v };
                    return next;
                  })
                }
              />
              <Field
                label="UK Verrohrg. (m)"
                value={row.uk_verrohrg}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], uk_verrohrg: v };
                    return next;
                  })
                }
              />
              <Field
                label="Bohrtiefe (m)"
                value={row.bohrtiefe}
                onChange={(v) =>
                  setGrundwasserRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], bohrtiefe: v };
                    return next;
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr]">
          <Field label="Pegelrohr Ø" value={data.pegel_durchmesser} onChange={(v) => update("pegel_durchmesser", v)} />
        </div>
            </Card>
          )
        : null}

      {showStep(4)
        ? renderStep(
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Card title="Pegelrohr / Ausbau">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="ROK" value={data.rok} onChange={(v) => update("rok", v)} />
                  <Field label="Sumpf (m)" value={data.sumpf} onChange={(v) => update("sumpf", v)} />
                  <Field label="Filterrohr (m)" value={data.filter_rohr} onChange={(v) => update("filter_rohr", v)} />
                  <Field label="SW" value={data.sw} onChange={(v) => update("sw", v)} />
                  <Field label="Vollrohr PVC (m)" value={data.vollrohr_pvc} onChange={(v) => update("vollrohr_pvc", v)} />
                  <Field label="Vollrohr Stahl (m)" value={data.vollrohr_stahl} onChange={(v) => update("vollrohr_stahl", v)} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Passavant" value={data.passavant} onChange={(v) => update("passavant", v)} />
                  <Field label="Ferngas" value={data.ferngas} onChange={(v) => update("ferngas", v)} />
                  <Field label="Seba" value={data.seba} onChange={(v) => update("seba", v)} />
                </div>
              </Card>

              <Card title="Hydr./Beton">
                <div className="grid gap-4">
                  <Field label="Hydr.Kp." value={data.hydr_kp} onChange={(v) => update("hydr_kp", v)} />
                  <Field label="Betonsockel" value={data.betonsockel} onChange={(v) => update("betonsockel", v)} />
                </div>
              </Card>
            </section>
          )
        : null}

      {showStep(5)
        ? renderStep(
            <Card title="Filter / Dichtung / Bohrgut">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Filterkies von" value={data.filterkies_von} onChange={(v) => update("filterkies_von", v)} />
                <Field label="Filterkies bis" value={data.filterkies_bis} onChange={(v) => update("filterkies_bis", v)} />
                <Field label="Tondichtung von" value={data.tondichtung_von} onChange={(v) => update("tondichtung_von", v)} />
                <Field label="Tondichtung bis" value={data.tondichtung_bis} onChange={(v) => update("tondichtung_bis", v)} />
                <Field label="Gegenfilter von" value={data.gegenfilter_von} onChange={(v) => update("gegenfilter_von", v)} />
                <Field label="Gegenfilter bis" value={data.gegenfilter_bis} onChange={(v) => update("gegenfilter_bis", v)} />
                <Field
                  label="Tondichtung von (unten)"
                  value={data.tondichtung_von_2}
                  onChange={(v) => update("tondichtung_von_2", v)}
                />
                <Field
                  label="Tondichtung bis (unten)"
                  value={data.tondichtung_bis_2}
                  onChange={(v) => update("tondichtung_bis_2", v)}
                />
                <Field label="Zem.-Bent. von" value={data.zement_bent_von} onChange={(v) => update("zement_bent_von", v)} />
                <Field label="Zem.-Bent. bis" value={data.zement_bent_bis} onChange={(v) => update("zement_bent_bis", v)} />
                <Field label="Bohrgut von" value={data.bohrgut_von} onChange={(v) => update("bohrgut_von", v)} />
                <Field label="Bohrgut bis" value={data.bohrgut_bis} onChange={(v) => update("bohrgut_bis", v)} />
              </div>
            </Card>
          )
        : null}

      {showStep(6)
        ? renderStep(
            <Card title="Schichtbeschreibung (Auszug)">
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
            Legende / Hilfe (Original‑Hinweise)
          </summary>
          <div className="px-3 pb-3 text-sm text-slate-600">
            <div className="grid gap-2 md:grid-cols-[0.8fr_2.6fr_1.2fr_0.6fr_0.6fr_0.6fr]">
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs font-semibold text-slate-700">Ansatzpunkt</div>
                <div className="mt-1 text-xs">Bis / unter Ansatzpunkt</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs font-semibold text-slate-700">
                  Benennung & Beschreibung der Schicht
                </div>
                <div className="mt-1 grid gap-1 text-xs">
                  <div>a1) Benennung und Beschreibung der Schicht</div>
                  <div>a2) Ergänzende Bemerkung</div>
                  <div>b) Beschaffenheit gemäß Bohrgut</div>
                  <div>c) Beschaffenheit gemäß Bohrvorgang</div>
                  <div>d) Farbe</div>
                  <div>f) Ortsübliche Bezeichnung</div>
                  <div>g) Geologische Bezeichnung</div>
                  <div>h) Gruppe</div>
                  <div>e) Kalkgehalt</div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <div className="text-xs font-semibold text-slate-700">Feststellungen</div>
                <div className="mt-1 text-xs">
                  Feststellungen beim Bohren: Wasserführung; Bohrwerkzeuge; SPT; Sonstiges
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 text-center">
                <div className="text-xs font-semibold text-slate-700">Proben</div>
                <div className="mt-1 text-xs">Art</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 text-center">
                <div className="text-xs font-semibold text-slate-700">Proben</div>
                <div className="mt-1 text-xs">Nr.</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 text-center">
                <div className="text-xs font-semibold text-slate-700">Proben</div>
                <div className="mt-1 text-xs">Tiefe (m)</div>
              </div>
            </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            a1–e + Feststellungen + Proben als Zeilen, wie im Original.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              X‑Offset Ansatzpunkt (Seite 2)
              <input
                className="h-7 w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                value={schichtXOffsetsPage2.ansatzpunkt_bis ?? "0"}
                onChange={(e) =>
                  setSchichtXOffsetsPage2((prev) => ({
                    ...prev,
                    ansatzpunkt_bis: e.target.value,
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              onClick={() => setSchichtRows((prev) => [...prev, emptySchichtRow()])}
            >
              + Zeile
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              onClick={() =>
                setSchichtRows((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
              }
            >
              – Zeile
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {schichtRows.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr_0.4fr]"
              style={{
                minHeight: `${Number(schichtRowHeight) || 200}px`,
              }}
            >
              <div className="rounded-xl border border-slate-200 h-full bg-white">
                <div className="grid h-full grid-cols-[0.35fr_1fr]">
                  <div className="border-r border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Ansatzpunkt
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      Bis unter Ansatzpunkt (m)
                    </div>
                    <textarea
                      className="mt-2 h-[128px] w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                      value={row.ansatzpunkt_bis ?? ""}
                      onChange={(e) =>
                        setSchichtRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], ansatzpunkt_bis: e.target.value };
                          return next;
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1fr_0.6fr] text-xs text-slate-600">
                    <div className="col-span-4 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Schichtbeschreibung
                    </div>
                    <label className="col-span-4 border-b border-slate-200 px-3 py-2">
                      a1
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.a1}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], a1: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="col-span-4 border-b border-slate-200 px-3 py-2">
                      a2
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.a2}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], a2: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="border-b border-r border-slate-200 px-3 py-2">
                      b
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.b}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], b: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="border-b border-r border-slate-200 px-3 py-2">
                      c
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.c}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], c: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="border-b border-r border-slate-200 px-3 py-2">
                      d
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.d}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], d: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <div className="border-b border-slate-200 px-3 py-2" />
                    <label className="border-r border-slate-200 px-3 py-2">
                      f
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.f}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], f: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="border-r border-slate-200 px-3 py-2">
                      g
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.g}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], g: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="border-r border-slate-200 px-3 py-2">
                      h
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.h}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], h: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                    <label className="px-3 py-2">
                      e
                      <input
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.e}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], e: e.target.value };
                            return next;
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 h-full">
                <div className="text-xs font-semibold text-slate-600">Feststellungen</div>
                <textarea
                  className="mt-2 h-full min-h-[160px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={row.feststellungen}
                  maxLength={MAX_FESTSTELLUNGEN_CHARS}
                  onChange={(e) =>
                    setSchichtRows((prev) => {
                      const next = [...prev];
                      next[idx] = {
                        ...next[idx],
                        feststellungen: e.target.value.slice(0, MAX_FESTSTELLUNGEN_CHARS),
                      };
                      return next;
                    })
                  }
                />
                <div className="mt-1 text-[10px] text-slate-400">
                  {row.feststellungen.length}/{MAX_FESTSTELLUNGEN_CHARS}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 h-full">
                <div className="text-xs font-semibold text-slate-600">Entnommene Proben</div>
                <div className="mt-3 grid gap-3">
                  <Field
                    label="Art"
                    value={row.proben_art}
                    onChange={(v) =>
                      setSchichtRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], proben_art: v };
                        return next;
                      })
                    }
                  />
                  <Field
                    label="Nr."
                    value={row.proben_nr}
                    onChange={(v) =>
                      setSchichtRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], proben_nr: v };
                        return next;
                      })
                    }
                  />
                  <Field
                    label="Tiefe (kurz)"
                    value={row.proben_tiefe}
                    onChange={(v) =>
                      setSchichtRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], proben_tiefe: v };
                        return next;
                      })
                    }
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Tiefe (mehrere Zeilen)
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                        onClick={() =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            const current = Array.isArray(next[idx].proben_tiefen)
                              ? [...next[idx].proben_tiefen]
                              : ["", "", ""];
                            if (current.length >= 10) return prev;
                            current.push("");
                            next[idx] = { ...next[idx], proben_tiefen: current };
                            return next;
                          })
                        }
                        disabled={(row.proben_tiefen?.length ?? 3) >= 10}
                      >
                        + Zeile
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                        onClick={() =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            const current = Array.isArray(next[idx].proben_tiefen)
                              ? [...next[idx].proben_tiefen]
                              : ["", "", ""];
                            if (current.length <= 3) return prev;
                            current.pop();
                            next[idx] = { ...next[idx], proben_tiefen: current };
                            return next;
                          })
                        }
                        disabled={(row.proben_tiefen?.length ?? 3) <= 3}
                      >
                        – Zeile
                      </button>
                    </div>
                  </div>
                  {(Array.isArray(row.proben_tiefen) ? row.proben_tiefen : ["", "", ""])
                    .slice(0, 10)
                    .map((_, i) => (
                      <input
                        key={i}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                        placeholder={`Tiefe ${i + 1}`}
                        value={row.proben_tiefen?.[i] ?? ""}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            const current = Array.isArray(next[idx].proben_tiefen)
                              ? [...next[idx].proben_tiefen]
                              : ["", "", ""];
                            current[i] = e.target.value;
                            next[idx] = { ...next[idx], proben_tiefen: current };
                            return next;
                          })
                        }
                      />
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
            </Card>
          )
        : null}

      {showStep(7)
        ? renderStep(
            <Card title="Proben / Übergabe">
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="GP" value={data.probe_gp} onChange={(v) => update("probe_gp", v)} />
                <Field label="KP" value={data.probe_kp} onChange={(v) => update("probe_kp", v)} />
                <Field label="SP" value={data.probe_sp} onChange={(v) => update("probe_sp", v)} />
                <Field label="WP" value={data.probe_wp} onChange={(v) => update("probe_wp", v)} />
                <Field label="Ki/m" value={data.probe_ki} onChange={(v) => update("probe_ki", v)} />
                <Field label="BKB" value={data.probe_bkb} onChange={(v) => update("probe_bkb", v)} />
                <Field label="SPT" value={data.probe_spt} onChange={(v) => update("probe_spt", v)} />
                <Field label="Probenart" value={data.proben_art} onChange={(v) => update("proben_art", v)} />
                <Field label="Proben‑Nr." value={data.proben_nr} onChange={(v) => update("proben_nr", v)} />
                <Field label="Probentiefe" value={data.proben_tiefe} onChange={(v) => update("proben_tiefe", v)} />
                <Field label="Übergeben am" value={data.uebergeben_am} onChange={(v) => update("uebergeben_am", v)} />
                <Field label="Übergeben an" value={data.uebergeben_an} onChange={(v) => update("uebergeben_an", v)} />
              </div>
            </Card>
          )
        : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary disabled:opacity-60"
            onClick={openPdf}
            disabled={loading}
          >
            {loading ? "Erzeuge PDF…" : "PDF Vorschau"}
          </button>
          <button
            type="button"
            className="btn btn-secondary disabled:opacity-60"
            onClick={downloadPdfToLocal}
            disabled={loading}
          >
            PDF lokal speichern
          </button>
          <button type="button" className="btn btn-secondary" onClick={fillTestData}>
            Test füllen
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-sky-50/60 px-4 py-2 border-b border-slate-200/70">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}


function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`space-y-1 ${className ?? ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <input
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
