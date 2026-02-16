"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useDraftActions } from "@/components/DraftActions";
import { SV_FIELDS } from "@/lib/pdf/schichtenverzeichnis.mapping";
import {
  DEFAULT_FIELD_OFFSETS_PAGE_1,
  DEFAULT_ROW_FIELD_OFFSETS_PAGE_1,
} from "@/lib/pdf/schichtenverzeichnis.default-offsets";

type FormData = Record<string, string>;
type SptEntry = {
  von_m: string;
  bis_m: string;
  schlag_1: string;
  schlag_2: string;
  schlag_3: string;
};
type BohrungEntry = {
  verfahren: "ramm" | "greif" | "rotation" | "ek_dks" | "voll";
  bohrung_bis: string;
  verrohrt_bis: string;
  verrohr_durchmesser: string;
};
type FilterRow = {
  filterkies_von: string;
  filterkies_bis: string;
  tondichtung_von: string;
  tondichtung_bis: string;
  gegenfilter_von: string;
  gegenfilter_bis: string;
  tondichtung_von_2: string;
  tondichtung_bis_2: string;
  zement_bent_von: string;
  zement_bent_bis: string;
  bohrgut_von: string;
  bohrgut_bis: string;
};
type FilterPairFieldKey =
  | "filterkies_von"
  | "filterkies_bis"
  | "tondichtung_von"
  | "tondichtung_bis"
  | "gegenfilter_von"
  | "gegenfilter_bis"
  | "tondichtung_von_2"
  | "tondichtung_bis_2"
  | "zement_bent_von"
  | "zement_bent_bis"
  | "bohrgut_von"
  | "bohrgut_bis";
type SchichtRow = {
  ansatzpunkt_bis: string;
  a1: string;
  a2: string;
  b: string;
  c: string;
  d: string;
  d_color: string;
  d_mix_x: string;
  d_mix_y: string;
  d_tint: string;
  e: string;
  f: string;
  g: string;
  h: string;
  feststellungen: string;
  proben_art: string;
  proben_nr: string;
  proben_tiefe: string;
  proben_tiefen: string[];
  proben_arten: string[];
  spt_eintraege: SptEntry[];
  spt_gemacht: boolean;
  spt_schlag_1: string;
  spt_schlag_2: string;
  spt_schlag_3: string;
};

type GroundwaterRow = {
  grundwasserstand: string;
  datum: string;
  uhrzeit: string;
  tiefe_m: string;
  uk_verrohrg: string;
  bohrtiefe: string;
};

type FieldOffsetXY = { x: string; y: string };
type RowFieldOffsetMap = Record<string, Record<string, FieldOffsetXY>>;
const SV_FORM_STATE_KEY = "sv_form_state_v1";

const SCHICHT_FINE_TUNE_FIELD_KEYS = [
  "schicht_ansatzpunkt_bis",
  "schicht_a1",
  "schicht_a2",
  "schicht_b",
  "schicht_c",
  "schicht_d",
  "schicht_e",
  "schicht_f",
  "schicht_g",
  "schicht_h",
  "feststellungen",
  "proben_art",
  "proben_nr",
  "proben_tiefe",
] as const;

const buildFieldOffsetState = (
  overrides?: Record<string, { x?: number | string; y?: number | string }>
): Record<string, FieldOffsetXY> => {
  const base = Object.fromEntries(
    Object.entries(DEFAULT_FIELD_OFFSETS_PAGE_1).map(([key, value]) => [
      key,
      { x: String(value.x), y: String(value.y) },
    ])
  ) as Record<string, FieldOffsetXY>;

  if (!overrides) return base;

  const normalized = Object.fromEntries(
    Object.entries(overrides).map(([key, value]) => [
      key,
      {
        x: String(Number(value?.x) || 0),
        y: String(Number(value?.y) || 0),
      },
    ])
  ) as Record<string, FieldOffsetXY>;

  return { ...base, ...normalized };
};

const buildRowFieldOffsetState = (
  overrides?: Record<string, Record<string, { x?: number | string; y?: number | string }>>
): RowFieldOffsetMap => {
  const base = Object.fromEntries(
    Object.entries(DEFAULT_ROW_FIELD_OFFSETS_PAGE_1).map(([rowIndex, fields]) => [
      rowIndex,
      Object.fromEntries(
        Object.entries(fields).map(([fieldKey, value]) => [
          fieldKey,
          { x: String(value.x), y: String(value.y) },
        ])
      ),
    ])
  ) as RowFieldOffsetMap;
  if (!overrides) return base;
  const normalized: RowFieldOffsetMap = { ...base };
  Object.entries(overrides).forEach(([rowIndex, fields]) => {
    normalized[rowIndex] = { ...(normalized[rowIndex] ?? {}) };
    Object.entries(fields ?? {}).forEach(([fieldKey, value]) => {
      normalized[rowIndex][fieldKey] = {
        x: String(Number(value?.x) || 0),
        y: String(Number(value?.y) || 0),
      };
    });
  });
  return normalized;
};

const MAX_FESTSTELLUNGEN_CHARS = 200;
const MAX_GROUNDWATER_ROWS = 50;
const BOHR_DURCHMESSER_OPTIONS = ["146", "178", "220", "273", "324", "368", "419", "509", "700", "880", "1.180", "1.500"] as const;
const RAMM_ROTATION_DURCHMESSER_OPTIONS = ["146", "178", "220", "273", "324", "368", "419", "509"] as const;
const GREIF_DURCHMESSER_OPTIONS = ["700", "880", "1.180", "1.500"] as const;
const SCHLITZWEITE_OPTIONS = ["0,5", "0,75", "1", "1,5", "1,75", "2", "2,25", "2,5"] as const;
const KIES_KOERNUNG_OPTIONS = ["0,71-1,25", "1,0-2,0", "2,0-3,15", "3,15-5,6", "5,6-8", "8,0-16"] as const;
const SCHICHT_E_OPTIONS = ["0", "+", "++"] as const;
const SCHICHT_C_OPTIONS = ["leicht", "mittel", "schwer"] as const;
const SCHICHT_D_COLOR_DEFAULT = "#8b5a2b";
const SCHICHT_D_TINT_DEFAULT = "gruen";
const PEGEL_DURCHMESSER_OPTIONS = [
  '2"',
  '3"',
  '4"',
  '5"',
  '6"',
  '8"',
  "DN100",
  "DN200",
  "DN300",
  "DN400",
  "DN500",
  "DN600",
  "DN700",
  "DN800",
] as const;
const PEGEL_DURCHMESSER_BASE_OPTIONS = ['2"', '3"', '4"', '5"', '6"', '8"', "DN100", "DN200"] as const;
const PEGEL_DURCHMESSER_ROTATION_OPTIONS = ['2"', '3"'] as const;
const PEGEL_DURCHMESSER_GREIF_EXTRA_OPTIONS = ["DN300", "DN400", "DN500", "DN600", "DN700", "DN800"] as const;
const GRUNDWASSERSTAND_OPTIONS = ["angebohrt", "eingespiegelt", "Bohrende", "im Pegel"] as const;
const FILTER_PAIR_CONFIG: Array<{
  id: string;
  title: string;
  vonKey: FilterPairFieldKey;
  bisKey: FilterPairFieldKey;
  vonLabel: string;
  bisLabel: string;
}> = [
  {
    id: "filterkies",
    title: "Filterkies",
    vonKey: "filterkies_von",
    bisKey: "filterkies_bis",
    vonLabel: "Filterkies von",
    bisLabel: "Filterkies bis",
  },
  {
    id: "tondichtung_1",
    title: "Tondichtung",
    vonKey: "tondichtung_von",
    bisKey: "tondichtung_bis",
    vonLabel: "Tondichtung von",
    bisLabel: "Tondichtung bis",
  },
  {
    id: "tondichtung_2",
    title: "Tondichtung (unten)",
    vonKey: "tondichtung_von_2",
    bisKey: "tondichtung_bis_2",
    vonLabel: "Tondichtung von (unten)",
    bisLabel: "Tondichtung bis (unten)",
  },
  {
    id: "gegenfilter",
    title: "Gegenfilter",
    vonKey: "gegenfilter_von",
    bisKey: "gegenfilter_bis",
    vonLabel: "Gegenfilter von",
    bisLabel: "Gegenfilter bis",
  },
  {
    id: "zement_bent",
    title: "Zem.-Bent.",
    vonKey: "zement_bent_von",
    bisKey: "zement_bent_bis",
    vonLabel: "Zem.-Bent. von",
    bisLabel: "Zem.-Bent. bis",
  },
  {
    id: "bohrgut",
    title: "Bohrgut",
    vonKey: "bohrgut_von",
    bisKey: "bohrgut_bis",
    vonLabel: "Bohrgut von",
    bisLabel: "Bohrgut bis",
  },
];
const formatDateForRange = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}.${match[2]}.${match[1]}`;
};
const composeDurchfuehrungszeit = (
  von: string | undefined | null,
  bis: string | undefined | null,
  fallback?: string
) => {
  const vonText = formatDateForRange(von);
  const bisText = formatDateForRange(bis);
  if (vonText && bisText) return `${vonText} - ${bisText}`;
  if (vonText) return `ab ${vonText}`;
  if (bisText) return `bis ${bisText}`;
  return String(fallback ?? "").trim();
};
const toDateInputValue = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmY = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
  return "";
};
const fromDateInputValue = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return raw;
};
const getTodayDateInputValue = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const toTimeInputValue = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hhmm = raw.match(/^(\d{2}:\d{2})$/);
  if (hhmm) return hhmm[1];
  const hhmmss = raw.match(/^(\d{2}:\d{2}):\d{2}$/);
  if (hhmmss) return hhmmss[1];
  return "";
};
const parseDepthNumeric = (value: string | undefined | null): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/[a-zA-Z]/.test(raw)) return null;
  const normalized = raw.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};
const formatDepthNumeric = (value: number): string => {
  const fixed = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
  return fixed.replace(".", ",");
};
const SPT_SEGMENT_DEPTH_M = 0.15;
const computeSptBisFromEntry = (entry: Partial<SptEntry> | null | undefined): string => {
  const fromValue = parseDepthNumeric(entry?.von_m);
  if (fromValue == null) return "";
  const filledSegments = [entry?.schlag_1, entry?.schlag_2, entry?.schlag_3].filter(
    (value) => String(value ?? "").trim() !== ""
  ).length;
  return formatDepthNumeric(fromValue + filledSegments * SPT_SEGMENT_DEPTH_M);
};

const initialData: FormData = {
  auftrag_nr: "",
  bohrmeister: "",
  blatt_nr: "",
  projekt_name: "",
  bohrung_nr: "",
  durchfuehrungszeit: "",
  durchfuehrungszeit_von: "",
  durchfuehrungszeit_bis: "",
  rammbohrung: "",
  rotationskernbohrung: "",
  vollbohrung: "",
  ek_dks: "",
  verrohrt_bis_1: "",
  verrohr_durch_1: "",
  verrohrt_bis_2: "",
  verrohr_durch_2: "",
  verrohrt_bis_3: "",
  verrohr_durch_3: "",
  verrohrt_bis_4: "",
  verrohr_durch_4: "",
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
  seba: "",
  sumpf: "",
  filter_rohr: "",
  sw: "",
  vollrohr_pvc: "",
  vollrohr_stahl_lage: "unterflur",
  vollrohr_stahl: "",
  betonsockel: "",
  kompaktkappe: "",
  kies_koernung: "",
  gegenfilter_koernung: "",
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
  probe_bg: "",
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
  d_color: SCHICHT_D_COLOR_DEFAULT,
  d_mix_x: "50",
  d_mix_y: "0",
  d_tint: SCHICHT_D_TINT_DEFAULT,
  e: "",
  f: "",
  g: "",
  h: "",
  feststellungen: "",
  proben_art: "",
  proben_nr: "",
  proben_tiefe: "",
  proben_tiefen: [""],
  proben_arten: ["GP"],
  spt_eintraege: [],
  spt_gemacht: false,
  spt_schlag_1: "",
  spt_schlag_2: "",
  spt_schlag_3: "",
});

const normalizeProbeType = (value: string | undefined | null) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "EP") return "EP";
  if (normalized === "UP") return "UP";
  if (normalized === "BG") return "BG";
  return "GP";
};
const computeProbeKiFromBohrungen = (rows: Array<Pick<BohrungEntry, "bohrung_bis">>) => {
  const values = rows
    .map((entry) => parseDepthNumeric(entry.bohrung_bis))
    .filter((n): n is number => n != null);
  if (!values.length) return "";
  const deepest = Math.max(...values);
  return formatDepthNumeric(deepest / 2);
};
const emptySptEntry = (): SptEntry => ({
  von_m: "",
  bis_m: "",
  schlag_1: "",
  schlag_2: "",
  schlag_3: "",
});

const normalizeSptEntries = (row: Partial<SchichtRow> | null | undefined): SptEntry[] => {
  const explicit = Array.isArray(row?.spt_eintraege)
    ? row.spt_eintraege.map((entry) => ({
        von_m: String(entry?.von_m ?? ""),
        bis_m: computeSptBisFromEntry(entry) || String(entry?.bis_m ?? ""),
        schlag_1: String(entry?.schlag_1 ?? ""),
        schlag_2: String(entry?.schlag_2 ?? ""),
        schlag_3: String(entry?.schlag_3 ?? ""),
      }))
    : [];

  if (explicit.length > 0) return explicit;
  if (!row?.spt_gemacht) return [];

  return [
    {
      von_m: "",
      bis_m: computeSptBisFromEntry({
        von_m: "",
        schlag_1: String(row?.spt_schlag_1 ?? ""),
        schlag_2: String(row?.spt_schlag_2 ?? ""),
        schlag_3: String(row?.spt_schlag_3 ?? ""),
      }),
      schlag_1: String(row?.spt_schlag_1 ?? ""),
      schlag_2: String(row?.spt_schlag_2 ?? ""),
      schlag_3: String(row?.spt_schlag_3 ?? ""),
    },
  ];
};

const normalizeSchichtRow = (row: Partial<SchichtRow> | null | undefined): SchichtRow => {
  const base = emptySchichtRow();
  const depthList = Array.isArray(row?.proben_tiefen) && row?.proben_tiefen.length
    ? row.proben_tiefen.map((v) => String(v ?? ""))
    : base.proben_tiefen;
  const defaultType = normalizeProbeType(row?.proben_art);
  const sourceTypes = Array.isArray(row?.proben_arten) ? row.proben_arten : [];
  const types = depthList.map((_, idx) => normalizeProbeType(sourceTypes[idx] ?? defaultType));
  const sptEntries = normalizeSptEntries(row);
  const firstSpt = sptEntries[0] ?? emptySptEntry();

  return {
    ...base,
    ...(row ?? {}),
    d: String(row?.d ?? base.d),
    d_color: String(row?.d_color ?? base.d_color),
    d_mix_x: String(row?.d_mix_x ?? base.d_mix_x),
    d_mix_y: String(row?.d_mix_y ?? base.d_mix_y),
    d_tint: String(row?.d_tint ?? base.d_tint),
    proben_tiefen: depthList,
    proben_arten: types,
    spt_eintraege: sptEntries,
    spt_gemacht: sptEntries.length > 0,
    spt_schlag_1: firstSpt.schlag_1,
    spt_schlag_2: firstSpt.schlag_2,
    spt_schlag_3: firstSpt.schlag_3,
  };
};

const emptyGroundwaterRow = (): GroundwaterRow => ({
  grundwasserstand: "",
  datum: "",
  uhrzeit: "",
  tiefe_m: "",
  uk_verrohrg: "",
  bohrtiefe: "",
});
const emptyFilterRow = (): FilterRow => ({
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
});
const normalizeFilterRows = (raw: unknown, fallback: FormData): FilterRow[] => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((entry) => ({
      filterkies_von: String((entry as Partial<FilterRow>)?.filterkies_von ?? ""),
      filterkies_bis: String((entry as Partial<FilterRow>)?.filterkies_bis ?? ""),
      tondichtung_von: String((entry as Partial<FilterRow>)?.tondichtung_von ?? ""),
      tondichtung_bis: String((entry as Partial<FilterRow>)?.tondichtung_bis ?? ""),
      gegenfilter_von: String((entry as Partial<FilterRow>)?.gegenfilter_von ?? ""),
      gegenfilter_bis: String((entry as Partial<FilterRow>)?.gegenfilter_bis ?? ""),
      tondichtung_von_2: String((entry as Partial<FilterRow>)?.tondichtung_von_2 ?? ""),
      tondichtung_bis_2: String((entry as Partial<FilterRow>)?.tondichtung_bis_2 ?? ""),
      zement_bent_von: String((entry as Partial<FilterRow>)?.zement_bent_von ?? ""),
      zement_bent_bis: String((entry as Partial<FilterRow>)?.zement_bent_bis ?? ""),
      bohrgut_von: String((entry as Partial<FilterRow>)?.bohrgut_von ?? ""),
      bohrgut_bis: String((entry as Partial<FilterRow>)?.bohrgut_bis ?? ""),
    }))
    .filter((row) => countFilled(Object.values(row)) > 0);

  if (normalized.length > 0) return normalized;

  const legacyFirst: FilterRow = {
    filterkies_von: fallback.filterkies_von ?? "",
    filterkies_bis: fallback.filterkies_bis ?? "",
    tondichtung_von: fallback.tondichtung_von ?? "",
    tondichtung_bis: fallback.tondichtung_bis ?? "",
    gegenfilter_von: fallback.gegenfilter_von ?? "",
    gegenfilter_bis: fallback.gegenfilter_bis ?? "",
    tondichtung_von_2: fallback.tondichtung_von_2 ?? "",
    tondichtung_bis_2: fallback.tondichtung_bis_2 ?? "",
    zement_bent_von: fallback.zement_bent_von ?? "",
    zement_bent_bis: fallback.zement_bent_bis ?? "",
    bohrgut_von: fallback.bohrgut_von ?? "",
    bohrgut_bis: fallback.bohrgut_bis ?? "",
  };
  return countFilled(Object.values(legacyFirst)) > 0 ? [legacyFirst] : [emptyFilterRow()];
};
const buildFilterPairRowCounts = (rows: FilterRow[]) => {
  const source = rows.length > 0 ? rows : [emptyFilterRow()];
  return Object.fromEntries(
    FILTER_PAIR_CONFIG.map((cfg) => {
      let lastFilledIndex = -1;
      source.forEach((row, idx) => {
        if (countFilled([row?.[cfg.vonKey], row?.[cfg.bisKey]]) > 0) {
          lastFilledIndex = idx;
        }
      });
      return [cfg.id, Math.max(1, lastFilledIndex + 1)];
    })
  ) as Record<string, number>;
};
const emptyBohrungEntry = (): BohrungEntry => ({
  verfahren: "ramm",
  bohrung_bis: "",
  verrohrt_bis: "",
  verrohr_durchmesser: "",
});
const normalizeBohrverfahren = (value: unknown): BohrungEntry["verfahren"] => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "greif") return "greif";
  if (raw === "rotation") return "rotation";
  if (raw === "ek_dks") return "ek_dks";
  if (raw === "voll") return "voll";
  return "ramm";
};
const getDurchmesserOptionsForVerfahren = (verfahren: BohrungEntry["verfahren"]) => {
  if (verfahren === "greif") return GREIF_DURCHMESSER_OPTIONS;
  if (verfahren === "ramm" || verfahren === "rotation") return RAMM_ROTATION_DURCHMESSER_OPTIONS;
  return BOHR_DURCHMESSER_OPTIONS;
};
const legacyBohrungenFromData = (values: FormData): BohrungEntry[] => {
  const rows: BohrungEntry[] = [
    {
      verfahren: "ramm",
      bohrung_bis: values.rammbohrung ?? "",
      verrohrt_bis: values.verrohrt_bis_1 ?? "",
      verrohr_durchmesser: values.verrohr_durch_1 ?? "",
    },
    {
      verfahren: "rotation",
      bohrung_bis: values.rotationskernbohrung ?? "",
      verrohrt_bis: values.verrohrt_bis_2 ?? "",
      verrohr_durchmesser: values.verrohr_durch_2 ?? "",
    },
    {
      verfahren: "ek_dks",
      bohrung_bis: values.ek_dks ?? "",
      verrohrt_bis: values.verrohrt_bis_3 ?? "",
      verrohr_durchmesser: values.verrohr_durch_3 ?? "",
    },
    {
      verfahren: "voll",
      bohrung_bis: values.vollbohrung ?? "",
      verrohrt_bis: values.verrohrt_bis_4 ?? "",
      verrohr_durchmesser: values.verrohr_durch_4 ?? "",
    },
  ];
  return rows.filter((row) => countFilled([row.bohrung_bis, row.verrohrt_bis, row.verrohr_durchmesser]) > 0);
};
const normalizeBohrungen = (raw: unknown, fallback: FormData): BohrungEntry[] => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((entry) => ({
      verfahren: normalizeBohrverfahren((entry as Partial<BohrungEntry>)?.verfahren),
      bohrung_bis: String((entry as Partial<BohrungEntry>)?.bohrung_bis ?? ""),
      verrohrt_bis: String((entry as Partial<BohrungEntry>)?.verrohrt_bis ?? ""),
      verrohr_durchmesser: String((entry as Partial<BohrungEntry>)?.verrohr_durchmesser ?? ""),
    }))
    .filter((entry) => countFilled([entry.bohrung_bis, entry.verrohrt_bis, entry.verrohr_durchmesser]) > 0);
  if (normalized.length > 0) return normalized;
  const legacy = legacyBohrungenFromData(fallback);
  return legacy.length > 0 ? legacy : [emptyBohrungEntry()];
};

const isFilled = (value: string | undefined | null) => Boolean(value?.trim());

const countFilled = (values: Array<string | undefined | null>) =>
  values.reduce((acc, value) => (isFilled(value) ? acc + 1 : acc), 0);

const extractDepthEndValue = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const normalized = raw.replace(/[–—]/g, "-");
  const dashParts = normalized
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  const tail = dashParts.length > 1 ? dashParts[dashParts.length - 1] : normalized;

  const numberMatches =
    tail.match(/\d+(?:[.,]\d+)?/g) ?? normalized.match(/\d+(?:[.,]\d+)?/g);
  if (!numberMatches?.length) return "";
  return numberMatches[numberMatches.length - 1];
};

const splitDepthRange = (value: string | undefined | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { from: "", to: "" };
  const normalized = raw.replace(/[–—]/g, "-");
  const parts = normalized.split("-").map((part) => part.trim());
  if (parts.length >= 2) {
    return {
      from: parts[0] ?? "",
      to: parts.slice(1).join(" ").trim(),
    };
  }
  return { from: raw, to: "" };
};

const joinDepthRange = (from: string | undefined | null, to: string | undefined | null) => {
  const fromText = String(from ?? "").trim();
  const toText = String(to ?? "").trim();
  if (!fromText && !toText) return "";
  if (fromText && toText) return `${fromText} - ${toText}`;
  return fromText || toText;
};

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
  const openNativePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      pickerInput.showPicker?.();
    } catch {
      // Fallback: Browser opens picker natively when supported.
    }
  };

  type SaveScope = "unset" | "project" | "my_reports";

  const savingRef = useRef(false);
  const reportSaveKeyRef = useRef<string | null>(null);
  const payloadDebugRef = useRef<{ save?: string; preview?: string }>({});
  const formStateHydratedRef = useRef(false);

  const [saveScope, setSaveScope] = useState<SaveScope>(projectId ? "project" : "unset");
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);
  const effectiveProjectId = projectId ?? localProjectId;
  const [prefillProjectId, setPrefillProjectId] = useState<string | null>(projectId ?? null);
  const [initialProjectChoiceDone, setInitialProjectChoiceDone] = useState<boolean>(Boolean(projectId) || mode === "edit");

  const pendingSaveResolveRef = useRef<
    ((v: { scope: SaveScope; projectId: string | null } | undefined) => void) | null
  >(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projektNameOptions, setProjektNameOptions] = useState<string[]>([]);
  const [projektMode, setProjektMode] = useState<"list" | "custom">("list");
  const [schlitzweiteMode, setSchlitzweiteMode] = useState<"list" | "custom">("list");
  const [kiesKoernungMode, setKiesKoernungMode] = useState<"list" | "custom">("list");
  const [gegenfilterKoernungMode, setGegenfilterKoernungMode] = useState<"list" | "custom">("list");
  const [projectUiLoading, setProjectUiLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [data, setData] = useState<FormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [schichtRows, setSchichtRows] = useState<SchichtRow[]>([
    emptySchichtRow(),
  ]);
  const [bohrungen, setBohrungen] = useState<BohrungEntry[]>([emptyBohrungEntry()]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([emptyFilterRow()]);
  const [filterPairRowCounts, setFilterPairRowCounts] = useState<Record<string, number>>(() =>
    buildFilterPairRowCounts([emptyFilterRow()])
  );
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
  const [fieldOffsetsPage1, setFieldOffsetsPage1] = useState<Record<string, FieldOffsetXY>>(
    () => buildFieldOffsetState()
  );
  const [rowFieldOffsetsPage1, setRowFieldOffsetsPage1] = useState<RowFieldOffsetMap>(() =>
    buildRowFieldOffsetState()
  );
  const [selectedFineTuneRow, setSelectedFineTuneRow] = useState(0);
  const useStepper = stepper;
  const steps = useMemo(
    () => [
      { key: "kopf", title: "Kopf & Projekt" },
      { key: "bohrung", title: "Bohrung / Verrohrung" },
      { key: "grundwasser", title: "Grundwasserstände" },
      { key: "pegel", title: "Pegelrohr / Ausbau" },
      { key: "filter", title: "Filter / Dichtung / Bohrgut" },
      { key: "schicht", title: "Schichtbeschreibung" },
      { key: "proben", title: "Proben & Übergabe" },
    ],
    []
  );
  const [stepIndex, setStepIndex] = useState(0);
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
  const page1PdfFields = useMemo(
    () =>
      SV_FIELDS.filter((field) => field.page === 1).map((field) => ({
        key: field.key,
        label: field.label ?? field.key,
      })),
    []
  );
  const fieldOffsetsPage1Payload = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fieldOffsetsPage1).map(([key, value]) => [
          key,
          {
            x: Number(value.x) || 0,
            y: Number(value.y) || 0,
          },
        ])
      ),
    [fieldOffsetsPage1]
  );
  const rowFieldOffsetsPage1Payload = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rowFieldOffsetsPage1).map(([rowIndex, fields]) => [
          rowIndex,
          Object.fromEntries(
            Object.entries(fields).map(([fieldKey, value]) => [
              fieldKey,
              { x: Number(value.x) || 0, y: Number(value.y) || 0 },
            ])
          ),
        ])
      ),
    [rowFieldOffsetsPage1]
  );
  const schichtFineTuneFields = useMemo(
    () =>
      SCHICHT_FINE_TUNE_FIELD_KEYS.map((key) => {
        const mapped = SV_FIELDS.find((field) => field.key === key);
        return { key, label: mapped?.label ?? key };
      }),
    []
  );
  const setFieldOffsetValue = useCallback(
    (fieldKey: string, axis: "x" | "y", value: string) => {
      setFieldOffsetsPage1((prev) => {
        const current = prev[fieldKey] ?? { x: "0", y: "0" };
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            [axis]: value,
          },
        };
      });
    },
    []
  );
  const adjustFieldOffset = useCallback(
    (fieldKey: string, axis: "x" | "y", delta: number) => {
      setFieldOffsetsPage1((prev) => {
        const current = prev[fieldKey] ?? { x: "0", y: "0" };
        const nextValue = (Number(current[axis]) || 0) + delta;
        return {
          ...prev,
          [fieldKey]: {
            ...current,
            [axis]: String(nextValue),
          },
        };
      });
    },
    []
  );
  const resetFieldOffset = useCallback((fieldKey: string) => {
    const fallback = DEFAULT_FIELD_OFFSETS_PAGE_1[fieldKey] ?? { x: 0, y: 0 };
    setFieldOffsetsPage1((prev) => ({
      ...prev,
      [fieldKey]: { x: String(fallback.x), y: String(fallback.y) },
    }));
  }, []);
  const setRowFieldOffsetValue = useCallback(
    (rowIndex: number, fieldKey: string, axis: "x" | "y", value: string) => {
      const rowKey = String(rowIndex);
      setRowFieldOffsetsPage1((prev) => {
        const row = prev[rowKey] ?? {};
        const current = row[fieldKey] ?? { x: "0", y: "0" };
        return {
          ...prev,
          [rowKey]: {
            ...row,
            [fieldKey]: { ...current, [axis]: value },
          },
        };
      });
    },
    []
  );
  const adjustRowFieldOffset = useCallback(
    (rowIndex: number, fieldKey: string, axis: "x" | "y", delta: number) => {
      const rowKey = String(rowIndex);
      setRowFieldOffsetsPage1((prev) => {
        const row = prev[rowKey] ?? {};
        const current = row[fieldKey] ?? { x: "0", y: "0" };
        const nextValue = (Number(current[axis]) || 0) + delta;
        return {
          ...prev,
          [rowKey]: {
            ...row,
            [fieldKey]: { ...current, [axis]: String(nextValue) },
          },
        };
      });
    },
    []
  );
  const resetRowFieldOffset = useCallback((rowIndex: number, fieldKey: string) => {
    const rowKey = String(rowIndex);
    const fallback = DEFAULT_ROW_FIELD_OFFSETS_PAGE_1[rowKey]?.[fieldKey] ?? { x: 0, y: 0 };
    setRowFieldOffsetsPage1((prev) => {
      const row = prev[rowKey] ?? {};
      return {
        ...prev,
        [rowKey]: {
          ...row,
          [fieldKey]: { x: String(fallback.x), y: String(fallback.y) },
        },
      };
    });
  }, []);
  const getFilterPairEntries = useCallback(
    (pairId: string, vonKey: FilterPairFieldKey, bisKey: FilterPairFieldKey) => {
      const visibleRows = Math.max(1, Math.min(10, Number(filterPairRowCounts[pairId]) || 1));
      return Array.from({ length: visibleRows }, (_, idx) => ({
        von: filterRows[idx]?.[vonKey] ?? "",
        bis: filterRows[idx]?.[bisKey] ?? "",
      }));
    },
    [filterRows, filterPairRowCounts]
  );
  const setFilterPairEntries = useCallback(
    (
      pairId: string,
      vonKey: FilterPairFieldKey,
      bisKey: FilterPairFieldKey,
      entries: Array<{ von: string; bis: string }>
    ) => {
      const nextVisibleRows = Math.max(1, Math.min(10, entries.length));
      setFilterPairRowCounts((prev) => ({ ...prev, [pairId]: nextVisibleRows }));
      setFilterRows((prev) => {
        const nextLength = Math.max(prev.length, entries.length, 1);
        const next = Array.from({ length: nextLength }, (_, idx) => ({
          ...emptyFilterRow(),
          ...(prev[idx] ?? {}),
        }));
        for (let i = 0; i < nextLength; i += 1) {
          next[i][vonKey] = entries[i]?.von ?? "";
          next[i][bisKey] = entries[i]?.bis ?? "";
        }
        return next;
      });
    },
    []
  );
  const stepProgress = useMemo(() => {
    const computedProbeKi = computeProbeKiFromBohrungen(bohrungen);
    const progress = [
      {
        filled: countFilled([
          data.auftrag_nr,
          data.bohrmeister,
          data.blatt_nr,
          data.projekt_name,
          data.durchfuehrungszeit_von,
          data.durchfuehrungszeit_bis,
        ]),
        total: 6,
      },
      {
        filled:
          countFilled([data.bohrung_nr]) +
          bohrungen.reduce(
            (acc, entry) =>
              acc +
              countFilled([entry.bohrung_bis, entry.verrohrt_bis, entry.verrohr_durchmesser]),
            0
          ),
        total: 1 + Math.max(1, bohrungen.length) * 3,
      },
      {
        filled: grundwasserRows.reduce(
          (acc, row) =>
            acc +
            countFilled([
              row.grundwasserstand,
              row.datum,
              row.uhrzeit,
              row.tiefe_m,
              row.uk_verrohrg,
              row.bohrtiefe,
            ]),
          0
        ),
        total: Math.max(1, grundwasserRows.length) * 6,
      },
      {
        filled: countFilled([
          data.pegel_durchmesser,
          data.rok,
          data.sumpf,
          data.filter_rohr,
          data.sw,
          data.vollrohr_pvc,
          data.vollrohr_stahl,
          data.passavant,
          data.seba,
          data.betonsockel,
          data.kompaktkappe,
          data.kies_koernung,
        ]),
        total: 12,
      },
      {
        filled: filterRows.reduce((acc, row) => acc + countFilled(Object.values(row)), 0),
        total: Math.max(1, filterRows.length) * 12,
      },
      {
        filled: schichtRows.reduce(
          (acc, row) =>
            acc +
            countFilled([
              row.ansatzpunkt_bis,
              row.a1,
              row.a2,
              row.b,
              row.c,
              row.d,
              row.e,
              row.f,
              row.g,
              row.h,
              row.feststellungen,
              row.proben_art,
              row.proben_nr,
              row.proben_tiefe,
            ]) +
            countFilled(row.proben_tiefen),
          0
        ),
        total: Math.max(1, schichtRows.length) * 17,
      },
      {
        filled: countFilled([
          computedProbeKi,
          data.proben_art,
          data.proben_nr,
          data.proben_tiefe,
          data.uebergeben_am,
          data.uebergeben_an,
        ]),
        total: 6,
      },
    ];

    const filled = progress.reduce((acc, step) => acc + step.filled, 0);
    const total = progress.reduce((acc, step) => acc + step.total, 0);
    const percent = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
    const firstIncompleteStep = progress.findIndex((step) => step.filled < step.total);

    return {
      steps: progress,
      totalFilled: filled,
      totalFields: total,
      percent,
      firstIncompleteStep: firstIncompleteStep === -1 ? null : firstIncompleteStep,
    };
  }, [data, bohrungen, filterRows, grundwasserRows, schichtRows]);
  const effectiveDurchfuehrungszeit = useMemo(
    () =>
      composeDurchfuehrungszeit(
        data.durchfuehrungszeit_von,
        data.durchfuehrungszeit_bis,
        data.durchfuehrungszeit
      ),
    [data.durchfuehrungszeit_von, data.durchfuehrungszeit_bis, data.durchfuehrungszeit]
  );
  const effectiveProbeKi = useMemo(
    () => computeProbeKiFromBohrungen(bohrungen),
    [bohrungen]
  );
  const normalizedBohrungenForPayload = useMemo(() => {
    const rows = bohrungen
      .map((entry) => ({
        verfahren: normalizeBohrverfahren(entry?.verfahren),
        bohrung_bis: String(entry?.bohrung_bis ?? ""),
        verrohrt_bis: String(entry?.verrohrt_bis ?? ""),
        verrohr_durchmesser: String(entry?.verrohr_durchmesser ?? ""),
      }))
      .filter((entry) => countFilled([entry.bohrung_bis, entry.verrohrt_bis, entry.verrohr_durchmesser]) > 0);
    return rows.length > 0 ? rows : [emptyBohrungEntry()];
  }, [bohrungen]);
  const legacyBohrungsFields = useMemo(() => {
    const getByType = (type: BohrungEntry["verfahren"]) =>
      normalizedBohrungenForPayload.find((entry) => entry.verfahren === type);
    const ramm = getByType("ramm");
    const rotation = getByType("rotation");
    const ekdks = getByType("ek_dks");
    const voll = getByType("voll");
    return {
      rammbohrung: ramm?.bohrung_bis ?? "",
      verrohrt_bis_1: ramm?.verrohrt_bis ?? "",
      verrohr_durch_1: ramm?.verrohr_durchmesser ?? "",
      rotationskernbohrung: rotation?.bohrung_bis ?? "",
      verrohrt_bis_2: rotation?.verrohrt_bis ?? "",
      verrohr_durch_2: rotation?.verrohr_durchmesser ?? "",
      ek_dks: ekdks?.bohrung_bis ?? "",
      verrohrt_bis_3: ekdks?.verrohrt_bis ?? "",
      verrohr_durch_3: ekdks?.verrohr_durchmesser ?? "",
      vollbohrung: voll?.bohrung_bis ?? "",
      verrohrt_bis_4: voll?.verrohrt_bis ?? "",
      verrohr_durch_4: voll?.verrohr_durchmesser ?? "",
    };
  }, [normalizedBohrungenForPayload]);
  const pegelDurchmesserAllowedOptions = useMemo(() => {
    const usedVerfahren = new Set(
      bohrungen
        .map((entry) => normalizeBohrverfahren(entry.verfahren))
        .filter(Boolean)
    );
    if (usedVerfahren.size === 0) return [...PEGEL_DURCHMESSER_BASE_OPTIONS];

    const allow = new Set<string>();
    if (usedVerfahren.has("ramm") || usedVerfahren.has("voll")) {
      PEGEL_DURCHMESSER_BASE_OPTIONS.forEach((opt) => allow.add(opt));
    }
    if (usedVerfahren.has("rotation")) {
      PEGEL_DURCHMESSER_ROTATION_OPTIONS.forEach((opt) => allow.add(opt));
    }
    if (usedVerfahren.has("greif")) {
      PEGEL_DURCHMESSER_BASE_OPTIONS.forEach((opt) => allow.add(opt));
      PEGEL_DURCHMESSER_GREIF_EXTRA_OPTIONS.forEach((opt) => allow.add(opt));
    }

    return PEGEL_DURCHMESSER_OPTIONS.filter((opt) => allow.has(opt));
  }, [bohrungen]);

  useEffect(() => {
    const current = String(data.pegel_durchmesser ?? "").trim();
    if (!current) return;
    if (!pegelDurchmesserAllowedOptions.includes(current as (typeof PEGEL_DURCHMESSER_OPTIONS)[number])) {
      setData((prev) => ({ ...prev, pegel_durchmesser: "" }));
    }
  }, [data.pegel_durchmesser, pegelDurchmesserAllowedOptions]);
  const normalizedFilterRowsForPayload = useMemo(() => {
    const rows = filterRows
      .map((row) => ({
        filterkies_von: String(row.filterkies_von ?? ""),
        filterkies_bis: String(row.filterkies_bis ?? ""),
        tondichtung_von: String(row.tondichtung_von ?? ""),
        tondichtung_bis: String(row.tondichtung_bis ?? ""),
        gegenfilter_von: String(row.gegenfilter_von ?? ""),
        gegenfilter_bis: String(row.gegenfilter_bis ?? ""),
        tondichtung_von_2: String(row.tondichtung_von_2 ?? ""),
        tondichtung_bis_2: String(row.tondichtung_bis_2 ?? ""),
        zement_bent_von: String(row.zement_bent_von ?? ""),
        zement_bent_bis: String(row.zement_bent_bis ?? ""),
        bohrgut_von: String(row.bohrgut_von ?? ""),
        bohrgut_bis: String(row.bohrgut_bis ?? ""),
      }))
      .filter((row) => countFilled(Object.values(row)) > 0);
    return rows.length > 0 ? rows : [emptyFilterRow()];
  }, [filterRows]);
  const legacyFilterFields = useMemo(() => {
    const first = normalizedFilterRowsForPayload[0] ?? emptyFilterRow();
    return { ...first };
  }, [normalizedFilterRowsForPayload]);

  const supabase = useMemo(() => createClient(), []);
  const { setSaveDraftHandler, setSaveReportHandler, triggerSaveReport } = useDraftActions();

  const fetchProjectPrefill = useCallback(
    async (targetProjectId: string) => {
      const { data: proj, error } = await supabase
        .from("projects")
        .select("name,project_number,start_date,end_date")
        .eq("id", targetProjectId)
        .single();

      if (error || !proj) return null;

      const p = proj as {
        name?: string | null;
        project_number?: string | null;
        start_date?: string | null;
        end_date?: string | null;
      };

      return {
        projekt_name: String(p.name ?? "").trim(),
        auftrag_nr: String(p.project_number ?? "").trim(),
        durchfuehrungszeit_von: fromDateInputValue(p.start_date ?? ""),
        durchfuehrungszeit_bis: fromDateInputValue(p.end_date ?? ""),
      };
    },
    [supabase]
  );

  const applyProjectPrefill = useCallback(
    async (targetProjectId: string, force = false) => {
      const prefill = await fetchProjectPrefill(targetProjectId);
      if (!prefill) return;

      setData((prev) => {
        const next = { ...prev };
        if (force || !String(prev.projekt_name ?? "").trim()) next.projekt_name = prefill.projekt_name;
        if (force || !String(prev.auftrag_nr ?? "").trim()) next.auftrag_nr = prefill.auftrag_nr;
        if (force || !String(prev.durchfuehrungszeit_von ?? "").trim()) next.durchfuehrungszeit_von = prefill.durchfuehrungszeit_von;
        if (force || !String(prev.durchfuehrungszeit_bis ?? "").trim()) next.durchfuehrungszeit_bis = prefill.durchfuehrungszeit_bis;

        const hadManualRange = String(prev.durchfuehrungszeit ?? "").trim().length > 0;
        if (force || !hadManualRange) {
          next.durchfuehrungszeit = composeDurchfuehrungszeit(
            next.durchfuehrungszeit_von,
            next.durchfuehrungszeit_bis,
            prev.durchfuehrungszeit
          );
        }

        return next;
      });

      setPrefillProjectId(targetProjectId);
    },
    [fetchProjectPrefill]
  );

  const hydrateDataWithProject = useCallback(
    async (baseData: FormData, targetProjectId: string | null): Promise<FormData> => {
      if (!targetProjectId) return baseData;
      const prefill = await fetchProjectPrefill(targetProjectId);
      if (!prefill) return baseData;

      const next = { ...baseData };
      next.projekt_name = prefill.projekt_name;
      next.auftrag_nr = prefill.auftrag_nr;
      next.durchfuehrungszeit_von = prefill.durchfuehrungszeit_von;
      next.durchfuehrungszeit_bis = prefill.durchfuehrungszeit_bis;
      next.durchfuehrungszeit = composeDurchfuehrungszeit(
        prefill.durchfuehrungszeit_von,
        prefill.durchfuehrungszeit_bis,
        baseData.durchfuehrungszeit
      );
      return next;
    },
    [fetchProjectPrefill]
  );

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

    // Outside a project route: always ask again where to save.
    await loadMyProjects();
    setProjectModalOpen(true);

    const result = await new Promise<{ scope: SaveScope; projectId: string | null } | undefined>((resolve) => {
      pendingSaveResolveRef.current = resolve;
    });

    pendingSaveResolveRef.current = null;
    return result ?? null;
  }, [projectId, saveScope, localProjectId, loadMyProjects]);

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
    setInitialProjectChoiceDone(true);
    await applyProjectPrefill(proj.id, true);

    pendingSaveResolveRef.current?.({ scope: "project", projectId: proj.id });
    pendingSaveResolveRef.current = null;

    setCreatingProject(false);
  }, [newProjectName, supabase, applyProjectPrefill]);

  useEffect(() => {
    if (mode !== "create") return;
    if (projectId) return;
    if (initialProjectChoiceDone) return;

    const boot = async () => {
      await loadMyProjects();
      setProjectModalOpen(true);
    };
    boot();
  }, [mode, projectId, initialProjectChoiceDone, loadMyProjects]);

  useEffect(() => {
    if (mode !== "create") return;
    if (!effectiveProjectId) return;
    applyProjectPrefill(effectiveProjectId, false);
  }, [mode, effectiveProjectId, applyProjectPrefill]);

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
      setBohrungen(normalizeBohrungen(db?.bohrungen, { ...initialData, ...(db ?? {}) }));
      {
        const normalizedFilter = normalizeFilterRows(db?.filter_rows, { ...initialData, ...(db ?? {}) });
        setFilterRows(normalizedFilter);
        setFilterPairRowCounts(buildFilterPairRowCounts(normalizedFilter));
      }
      setSchichtRows(
        Array.isArray(db?.schicht_rows) && db.schicht_rows.length
          ? db.schicht_rows.map((row: Partial<SchichtRow>) => normalizeSchichtRow(row))
          : [emptySchichtRow()]
      );
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
      if (db?.field_offsets_page_1 != null && typeof db.field_offsets_page_1 === "object") {
        setFieldOffsetsPage1(
          buildFieldOffsetState(
            db.field_offsets_page_1 as Record<string, { x?: number | string; y?: number | string }>
          )
        );
      }
      if (
        db?.schicht_row_field_offsets_page_1 != null &&
        typeof db.schicht_row_field_offsets_page_1 === "object"
      ) {
        setRowFieldOffsetsPage1(
          buildRowFieldOffsetState(
            db.schicht_row_field_offsets_page_1 as Record<
              string,
              Record<string, { x?: number | string; y?: number | string }>
            >
          )
        );
      }
      if (db?.schicht_row_offsets_page_2 != null && Array.isArray(db.schicht_row_offsets_page_2)) {
        setSchichtRowOffsetsPage2(db.schicht_row_offsets_page_2.map((v: number | string) => String(v ?? "0")));
      }
    };

    load();
  }, [mode, reportId, supabase]);

  // Draft-like state restore for create mode (helps iPhone back navigation).
  useEffect(() => {
    if (mode === "edit") {
      formStateHydratedRef.current = true;
      return;
    }
    try {
      const raw = sessionStorage.getItem(SV_FORM_STATE_KEY);
      if (!raw) {
        formStateHydratedRef.current = true;
        return;
      }
      const saved = JSON.parse(raw) as {
        data?: Record<string, unknown>;
        bohrungen?: unknown;
        filterRows?: unknown;
        grundwasserRows?: unknown;
        schichtRows?: unknown;
        stepIndex?: number;
      };
      if (saved.data && typeof saved.data === "object") {
        setData((prev) => ({ ...prev, ...(saved.data as Record<string, string>) }));
      }
      if (Array.isArray(saved.bohrungen)) {
        setBohrungen(normalizeBohrungen(saved.bohrungen, initialData));
      }
      if (Array.isArray(saved.filterRows)) {
        const normalizedFilter = normalizeFilterRows(saved.filterRows, initialData);
        setFilterRows(normalizedFilter);
        setFilterPairRowCounts(buildFilterPairRowCounts(normalizedFilter));
      }
      if (Array.isArray(saved.grundwasserRows)) {
        setGrundwasserRows(saved.grundwasserRows as GroundwaterRow[]);
      }
      if (Array.isArray(saved.schichtRows)) {
        setSchichtRows(
          saved.schichtRows.length
            ? (saved.schichtRows as Partial<SchichtRow>[]).map((row) => normalizeSchichtRow(row))
            : [emptySchichtRow()]
        );
      }
      if (typeof saved.stepIndex === "number" && Number.isFinite(saved.stepIndex)) {
        setStepIndex(Math.max(0, Math.min(saved.stepIndex, steps.length - 1)));
      }
    } catch {
      // ignore broken session state
    } finally {
      formStateHydratedRef.current = true;
    }
  }, [mode, steps.length]);

  useEffect(() => {
    if (mode === "edit" || !formStateHydratedRef.current) return;
    try {
      sessionStorage.setItem(
        SV_FORM_STATE_KEY,
        JSON.stringify({
          data,
          bohrungen,
          filterRows,
          grundwasserRows,
          schichtRows,
          stepIndex,
        })
      );
    } catch {
      // ignore quota/private mode issues
    }
  }, [mode, data, bohrungen, filterRows, grundwasserRows, schichtRows, stepIndex]);

  useEffect(() => {
    const onPageShow = () => setLoading(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const loadProjektNameOptions = async () => {
      const { data: rows, error } = await supabase
        .from("projects")
        .select("project_number,name")
        .order("created_at", { ascending: false });
      if (error) return;
      const projektValues = Array.from(
        new Set(
          (rows ?? [])
            .map((row: { name?: string | null }) => String(row?.name ?? "").trim())
            .filter(Boolean)
        )
      );
      setProjektNameOptions(projektValues);
    };
    loadProjektNameOptions();
  }, [supabase]);

  useEffect(() => {
    const current = String(data.projekt_name ?? "").trim();
    if (!current) {
      setProjektMode("list");
      return;
    }
    if (!projektNameOptions.includes(current)) {
      setProjektMode("custom");
    }
  }, [data.projekt_name, projektNameOptions]);

  useEffect(() => {
    const current = String(data.sw ?? "").trim();
    if (!current) {
      setSchlitzweiteMode("list");
      return;
    }
    if (!SCHLITZWEITE_OPTIONS.includes(current as (typeof SCHLITZWEITE_OPTIONS)[number])) {
      setSchlitzweiteMode("custom");
    } else {
      setSchlitzweiteMode("list");
    }
  }, [data.sw]);

  useEffect(() => {
    const current = String(data.kies_koernung ?? "").trim();
    if (!current) {
      setKiesKoernungMode("list");
      return;
    }
    if (!KIES_KOERNUNG_OPTIONS.includes(current as (typeof KIES_KOERNUNG_OPTIONS)[number])) {
      setKiesKoernungMode("custom");
    } else {
      setKiesKoernungMode("list");
    }
  }, [data.kies_koernung]);

  useEffect(() => {
    const current = String(data.gegenfilter_koernung ?? "").trim();
    if (!current) {
      setGegenfilterKoernungMode("list");
      return;
    }
    if (!KIES_KOERNUNG_OPTIONS.includes(current as (typeof KIES_KOERNUNG_OPTIONS)[number])) {
      setGegenfilterKoernungMode("custom");
    } else {
      setGegenfilterKoernungMode("list");
    }
  }, [data.gegenfilter_koernung]);

  const hasRequiredDurchfuehrungszeit = useMemo(
    () =>
      Boolean(String(data.durchfuehrungszeit_von ?? "").trim()) &&
      Boolean(String(data.durchfuehrungszeit_bis ?? "").trim()),
    [data.durchfuehrungszeit_von, data.durchfuehrungszeit_bis]
  );
  const ensureRequiredDurchfuehrungszeit = useCallback(() => {
    if (hasRequiredDurchfuehrungszeit) return true;
    alert('Pflichtfeld fehlt: "Durchführung von" und "Durchführung bis" müssen ausgefüllt sein.');
    if (useStepper) setStepIndex(0);
    return false;
  }, [hasRequiredDurchfuehrungszeit, useStepper]);
  const hasRequiredSchichtfelder = useMemo(
    () =>
      schichtRows.every(
        (row) =>
          Boolean(String(row.ansatzpunkt_bis ?? "").trim()) &&
          Boolean(String(row.a1 ?? "").trim())
      ),
    [schichtRows]
  );
  const ensureRequiredSchichtfelder = useCallback(() => {
    if (hasRequiredSchichtfelder) return true;
    alert('Pflichtfeld fehlt: In jeder Schichtzeile müssen "Bis unter Ansatzpunkt (m)" und "a1 (Benennung)" ausgefüllt sein.');
    if (useStepper) setStepIndex(5);
    return false;
  }, [hasRequiredSchichtfelder, useStepper]);

  useEffect(() => {
    setSaveDraftHandler(async () => {
      if (!ensureRequiredDurchfuehrungszeit()) return;
      if (!ensureRequiredSchichtfelder()) return;
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return alert("Nicht eingeloggt.");

      const draftData = {
        ...data,
        probe_ki: effectiveProbeKi,
        ...legacyBohrungsFields,
        ...legacyFilterFields,
        durchfuehrungszeit: effectiveDurchfuehrungszeit,
        bohrungen: normalizedBohrungenForPayload,
        filter_rows: normalizedFilterRowsForPayload,
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
        field_offsets_page_1: fieldOffsetsPage1Payload,
        schicht_row_field_offsets_page_1: rowFieldOffsetsPage1Payload,
        schicht_row_offsets_page_2: schichtRowOffsetsPage2.map((v) => Number(v) || 0),
      };

      const title =
        data.projekt_name?.trim()
          ? `Schichtenverzeichnis – ${data.projekt_name}${data.datum ? ` (${data.datum})` : ""}`
          : `Schichtenverzeichnis Entwurf (${data.datum ?? ""})`;

      const { error } = await supabase.from("drafts").insert({
        user_id: user.id,
        project_id: effectiveProjectId ?? null,
        report_type: "schichtenverzeichnis",
        title,
        data: draftData,
      });

      if (error) {
        console.error(error);
        return alert("Entwurf speichern fehlgeschlagen: " + error.message);
      }

      alert("Entwurf gespeichert ✅");
    });

    setSaveReportHandler(async () => {
      if (savingRef.current) return;
      savingRef.current = true;

      try {
        if (!ensureRequiredDurchfuehrungszeit()) return;
        if (!ensureRequiredSchichtfelder()) return;
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return alert("Nicht eingeloggt.");

        const target = await ensureSaveTarget();
        if (!target) return;
        const { scope, projectId } = target;

        if (!reportSaveKeyRef.current) {
          reportSaveKeyRef.current = crypto.randomUUID();
        }

        const normalizeTitlePart = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
        const auftragsnummer = normalizeTitlePart(data.auftrag_nr);
        const name = normalizeTitlePart(data.bohrmeister);
        const bohrung = normalizeTitlePart(data.bohrung_nr);
        if (!auftragsnummer) {
          alert('Pflichtfeld fehlt: "Auftrag-Nr." muss vor dem Speichern ausgefüllt sein.');
          if (useStepper) setStepIndex(0);
          return;
        }
        if (!name) {
          alert('Pflichtfeld fehlt: "Bohrmeister" (Name) muss vor dem Speichern ausgefüllt sein.');
          if (useStepper) setStepIndex(0);
          return;
        }
        if (!bohrung) {
          alert('Pflichtfeld fehlt: "Bohrung Nr." muss vor dem Speichern ausgefüllt sein.');
          if (useStepper) setStepIndex(1);
          return;
        }
        const title = `${auftragsnummer}_${name}_${bohrung}`;

        const reportData = buildReportDataPayload();
        debugPayloadParity("save", reportData);

        if (mode === "edit") {
          if (!reportId) {
            alert("Fehler: reportId fehlt im Edit-Modus");
            return;
          }

          const { data: updatedReport, error } = await supabase
            .from("reports")
            .update({
              title,
              data: reportData,
              status: "final",
              project_id: scope === "project" ? projectId : null,
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
    effectiveDurchfuehrungszeit,
    legacyBohrungsFields,
    legacyFilterFields,
    normalizedBohrungenForPayload,
    normalizedFilterRowsForPayload,
    filterRows,
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
    fieldOffsetsPage1Payload,
    rowFieldOffsetsPage1Payload,
    schichtRowOffsetsPage2,
    effectiveProjectId,
    ensureSaveTarget,
    ensureRequiredDurchfuehrungszeit,
    ensureRequiredSchichtfelder,
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
      if (saved.fieldOffsetsPage1 != null && typeof saved.fieldOffsetsPage1 === "object") {
        setFieldOffsetsPage1(
          buildFieldOffsetState(
            saved.fieldOffsetsPage1 as Record<string, { x?: number | string; y?: number | string }>
          )
        );
      }
      if (
        saved.schichtRowFieldOffsetsPage1 != null &&
        typeof saved.schichtRowFieldOffsetsPage1 === "object"
      ) {
        setRowFieldOffsetsPage1(
          buildRowFieldOffsetState(
            saved.schichtRowFieldOffsetsPage1 as Record<
              string,
              Record<string, { x?: number | string; y?: number | string }>
            >
          )
        );
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
          fieldOffsetsPage1: fieldOffsetsPage1Payload,
          schichtRowFieldOffsetsPage1: rowFieldOffsetsPage1Payload,
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
    fieldOffsetsPage1Payload,
    rowFieldOffsetsPage1Payload,
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
      if (saved.fieldOffsetsPage1 != null && typeof saved.fieldOffsetsPage1 === "object") {
        setFieldOffsetsPage1(
          buildFieldOffsetState(
            saved.fieldOffsetsPage1 as Record<string, { x?: number | string; y?: number | string }>
          )
        );
      }
      if (
        saved.schichtRowFieldOffsetsPage1 != null &&
        typeof saved.schichtRowFieldOffsetsPage1 === "object"
      ) {
        setRowFieldOffsetsPage1(
          buildRowFieldOffsetState(
            saved.schichtRowFieldOffsetsPage1 as Record<
              string,
              Record<string, { x?: number | string; y?: number | string }>
            >
          )
        );
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
    fieldOffsetsPage1: fieldOffsetsPage1Payload,
    schichtRowFieldOffsetsPage1: rowFieldOffsetsPage1Payload,
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
  const vollrohrStahlLage = data.vollrohr_stahl_lage === "ueberflur" ? "ueberflur" : "unterflur";
  const toggleMark = (key: keyof FormData, checked: boolean) => {
    setData((prev) => ({ ...prev, [key]: checked ? "x" : "" }));
  };
  const persistFormStateSnapshot = () => {
    if (mode === "edit") return;
    try {
      sessionStorage.setItem(
        SV_FORM_STATE_KEY,
        JSON.stringify({
          data,
          bohrungen,
          filterRows,
          grundwasserRows,
          schichtRows,
          stepIndex,
        })
      );
    } catch {
      // ignore
    }
  };
  const openPdfInPreviewWindow = (previewWindow: Window | null, objectUrl: string) => {
    const ua = navigator.userAgent;
    const isIPhoneLike = /iPhone|iPod/i.test(ua);
    const isIPadLike =
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && !isIPhoneLike);
    const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
    const isTabletLike = isIPadLike || isAndroidTablet;
    if (!previewWindow) {
      window.location.href = objectUrl;
      return;
    }
    if (isTabletLike) {
      try {
        previewWindow.document.open();
        previewWindow.document.write(
          `<!doctype html><html><head><meta charset="utf-8"><title>PDF Vorschau</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#111;"><embed src="${objectUrl}" type="application/pdf" style="width:100vw;height:100vh;" /><div style="position:fixed;right:12px;bottom:12px;padding:8px 12px;background:#fff;border-radius:10px;font:12px sans-serif;">Falls leer: kurz tippen oder Seite neu laden.</div></body></html>`
        );
        previewWindow.document.close();
        return;
      } catch {
        // fallback below
      }
    }
    previewWindow.location.href = objectUrl;
  };

  const buildReportDataPayload = (baseData: FormData = data) => ({
    ...baseData,
    probe_ki: effectiveProbeKi,
    ...legacyBohrungsFields,
    ...legacyFilterFields,
    durchfuehrungszeit: effectiveDurchfuehrungszeit,
    bohrungen: normalizedBohrungenForPayload,
    filter_rows: normalizedFilterRowsForPayload,
    grundwasser_rows: grundwasserRows,
    schicht_rows: schichtRows.map((row) => {
      const entries = Array.isArray(row.spt_eintraege) ? row.spt_eintraege : [];
      return {
        ...row,
        spt_eintraege: entries.map((entry) => ({
          ...entry,
          bis_m: computeSptBisFromEntry(entry),
        })),
      };
    }),
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
    field_offsets_page_1: fieldOffsetsPage1Payload,
    schicht_row_field_offsets_page_1: rowFieldOffsetsPage1Payload,
    schicht_row_offsets_page_2: schichtRowOffsetsPage2.map((v) => Number(v) || 0),
  });

  const debugPayloadParity = (kind: "save" | "preview", payload: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "development") return;
    try {
      const serialized = JSON.stringify(payload);
      const otherKind: "save" | "preview" = kind === "save" ? "preview" : "save";
      const otherSerialized = payloadDebugRef.current[otherKind];
      const matchesOther = typeof otherSerialized === "string" ? otherSerialized === serialized : null;
      payloadDebugRef.current[kind] = serialized;
      console.groupCollapsed(`[SV payload debug] ${kind}`);
      console.log("chars:", serialized.length);
      if (matchesOther == null) {
        console.log(`no previous ${otherKind} payload to compare yet`);
      } else {
        console.log(`matches previous ${otherKind}:`, matchesOther);
      }
      console.groupEnd();
    } catch (error) {
      console.warn("[SV payload debug] compare failed", error);
    }
  };

  const openPdf = async () => {
    if (!ensureRequiredDurchfuehrungszeit()) return;
    if (!ensureRequiredSchichtfelder()) return;
    const previewWindow = window.open("", "_blank");
    setLoading(true);
    try {
      persistFormStateSnapshot();
      saveOffsetsSnapshot();
      const params = new URLSearchParams();
      params.set("debug", "1");
      if (Number(gridStep)) params.set("grid", String(Number(gridStep)));
      const payload = buildReportDataPayload();
      debugPayloadParity("preview", payload);
      const res = await fetch(`/api/pdf/schichtenverzeichnis?${params.toString()}`, {
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
      // iOS may navigate current tab; clear loading before handing over navigation.
      setLoading(false);
      openPdfInPreviewWindow(previewWindow, url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      if (previewWindow) previewWindow.close();
      console.error("Schichtenverzeichnis preview failed", e);
      alert("PDF-Vorschau fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdfToLocal = async () => {
    if (!ensureRequiredDurchfuehrungszeit()) return;
    if (!ensureRequiredSchichtfelder()) return;
    setLoading(true);
    try {
      saveOffsetsSnapshot();
      const params = new URLSearchParams();
      if (showGrid) params.set("debug", "1");
      if (Number(gridStep)) params.set("grid", String(Number(gridStep)));
      const payload = buildReportDataPayload();

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
      durchfuehrungszeit: "30.01.2026 - 31.01.2026",
      durchfuehrungszeit_von: "2026-01-30",
      durchfuehrungszeit_bis: "2026-01-31",
      rammbohrung: "12,5",
      rotationskernbohrung: "38,0",
      vollbohrung: "46,0",
      ek_dks: "DN80",
      verrohrt_bis_1: "10,0",
      verrohr_durch_1: "146",
      verrohrt_bis_2: "20,0",
      verrohr_durch_2: "178",
      verrohrt_bis_3: "30,0",
      verrohr_durch_3: "220",
      verrohrt_bis_4: "40,0",
      verrohr_durch_4: "273",
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
      seba: "x",
      sumpf: "1,20",
      filter_rohr: "9,80",
      sw: "0,5",
      vollrohr_pvc: "6,00",
      vollrohr_stahl_lage: "ueberflur",
      vollrohr_stahl: "4,00",
      betonsockel: "x",
      kies_koernung: "2,0-3,15",
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
      probe_spt: "",
      uebergeben_am: "30.01.2026",
      uebergeben_an: "Labor X",
    });
    setBohrungen([
      { verfahren: "ramm", bohrung_bis: "12,5", verrohrt_bis: "10,0", verrohr_durchmesser: "146" },
      { verfahren: "rotation", bohrung_bis: "38,0", verrohrt_bis: "20,0", verrohr_durchmesser: "178" },
      { verfahren: "ek_dks", bohrung_bis: "DN80", verrohrt_bis: "30,0", verrohr_durchmesser: "220" },
      { verfahren: "voll", bohrung_bis: "46,0", verrohrt_bis: "40,0", verrohr_durchmesser: "273" },
    ]);
    const testFilterRows: FilterRow[] = [
      {
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
      },
      {
        filterkies_von: "12,00",
        filterkies_bis: "13,50",
        tondichtung_von: "3,50",
        tondichtung_bis: "4,20",
        gegenfilter_von: "6,00",
        gegenfilter_bis: "6,80",
        tondichtung_von_2: "7,50",
        tondichtung_bis_2: "8,10",
        zement_bent_von: "9,00",
        zement_bent_bis: "9,80",
        bohrgut_von: "42,00",
        bohrgut_bis: "44,00",
      },
    ];
    setFilterRows(testFilterRows);
    setFilterPairRowCounts(buildFilterPairRowCounts(testFilterRows));

    const maxRows = Math.max(1, Number(schichtRowsPerPage1) + Number(schichtRowsPerPage2));
    setGrundwasserRows(
      Array.from({ length: 12 }, (_, idx) => ({
        ...emptyGroundwaterRow(),
        grundwasserstand:
          idx % 4 === 0
            ? "angebohrt"
            : idx % 4 === 1
              ? "eingespiegelt"
              : idx % 4 === 2
                ? "Bohrende"
                : "im Pegel",
        datum: `30.01.2026`,
        uhrzeit: `${String(7 + Math.floor(idx / 2)).padStart(2, "0")}:${idx % 2 === 0 ? "15" : "45"}`,
        tiefe_m: (3.2 + idx * 0.35).toFixed(2),
        uk_verrohrg: (8.5 + idx * 0.45).toFixed(2),
        bohrtiefe: (42 + idx * 1.2).toFixed(2),
      }))
    );

    setSchichtRows(
      Array.from({ length: maxRows }, (_, idx) => ({
        ...emptySchichtRow(),
        ansatzpunkt_bis: `${(idx + 1) * 0.5}`,
        a1: `a1 Beispiel ${idx + 1}`,
        a2: `a2 Beispiel ${idx + 1}`,
        b: "b",
        c: "mittel",
        d: "grau",
        d_color: "#808080",
        d_mix_x: "50",
        d_mix_y: "20",
        d_tint: "blau",
        e: "0",
        f: "f",
        g: "g",
        h: "h",
        feststellungen: "Feststellung: keine Besonderheiten.",
        proben_art: "GP",
        proben_nr: `P-${idx + 1}`,
        proben_tiefe: "3,2",
        proben_tiefen: ["0,0 - 2,3", "3,2", "4,1 - 5,0"],
        proben_arten: ["GP", "EP", "UP", "BG"],
        spt_eintraege:
          idx === 0
            ? [
                { von_m: "50", bis_m: "75", schlag_1: "50", schlag_2: "45", schlag_3: "40" },
                { von_m: "75", bis_m: "100", schlag_1: "15", schlag_2: "15", schlag_3: "15" },
              ]
            : idx === 1
              ? [{ von_m: "100", bis_m: "125", schlag_1: "20", schlag_2: "18", schlag_3: "12" }]
              : [],
        spt_gemacht: idx <= 1,
        spt_schlag_1: idx === 0 ? "54" : idx === 1 ? "20" : "",
        spt_schlag_2: idx === 0 ? "40" : idx === 1 ? "18" : "",
        spt_schlag_3: idx === 0 ? "15" : idx === 1 ? "12" : "",
      }))
    );
  };

  const resetAllInputs = () => {
    if (!confirm("Alle Eingaben wirklich löschen?")) return;
    setData(initialData);
    setProjektMode("list");
    setSchlitzweiteMode("list");
    setBohrungen([emptyBohrungEntry()]);
    setFilterRows([emptyFilterRow()]);
    setFilterPairRowCounts(buildFilterPairRowCounts([emptyFilterRow()]));
    setSchichtRows([emptySchichtRow()]);
    setGrundwasserRows([emptyGroundwaterRow()]);
    try {
      sessionStorage.removeItem(SV_FORM_STATE_KEY);
    } catch {
      // ignore
    }
  };

  const showStep = (index: number) => !useStepper || stepIndex === index;
  const containerClass = useStepper
    ? "mt-6 space-y-6 max-w-[2000px] mx-auto w-full overflow-x-hidden px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8 pb-16 text-slate-900 min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 rounded-3xl border border-slate-200/60 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]"
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
            <div className="min-w-[220px] flex-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Fortschritt</span>
                <span>
                  {stepProgress.percent}% ({stepProgress.totalFilled}/{stepProgress.totalFields})
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 transition-all"
                  style={{ width: `${stepProgress.percent}%` }}
                />
              </div>
            </div>
            {stepProgress.firstIncompleteStep != null ? (
              <button
                type="button"
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                onClick={() => setStepIndex(stepProgress.firstIncompleteStep ?? 0)}
              >
                Nächster offener Schritt
              </button>
            ) : null}
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
                    : stepProgress.steps[i]?.filled === stepProgress.steps[i]?.total
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {i + 1}. {s.title}{" "}
                <span className="ml-1 text-[10px] font-medium opacity-75">
                  ({stepProgress.steps[i]?.filled ?? 0}/{stepProgress.steps[i]?.total ?? 0})
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-3xl border border-sky-100 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(2,132,199,0.45)] sm:p-5">
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
        </div>
      </header>
      {showStep(0)
        ? renderStep(
            <Card title="Kopf & Projekt">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_0.6fr]">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Auftrag‑Nr.
                  </span>
                  <input
                    className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    placeholder="Auftrag-Nr."
                    value={data.auftrag_nr ?? ""}
                    onChange={(e) => update("auftrag_nr", e.target.value)}
                  />
                </div>
                <Field label="Bohrmeister" value={data.bohrmeister} onChange={(v) => update("bohrmeister", v)} />
                <Field label="Blatt" value={data.blatt_nr} onChange={(v) => update("blatt_nr", v)} />
                <div className="space-y-1 md:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Projekt
                  </span>
                  <div className="grid gap-2">
                    <select
                      className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={
                        projektMode === "custom"
                          ? "__custom__"
                          : String(data.projekt_name ?? "").trim()
                            ? data.projekt_name
                            : "__empty__"
                      }
                      onChange={(e) => {
                        const selected = e.target.value;
                        if (selected === "__custom__") {
                          setProjektMode("custom");
                          return;
                        }
                        setProjektMode("list");
                        update("projekt_name", selected === "__empty__" ? "" : selected);
                      }}
                    >
                      <option value="__empty__">Projekt auswählen…</option>
                      {projektNameOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      <option value="__custom__">Eigenen Projektnamen eingeben…</option>
                    </select>
                    {projektMode === "custom" ? (
                      <input
                        className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                        placeholder="Eigener Projektname"
                        value={data.projekt_name ?? ""}
                        onChange={(e) => update("projekt_name", e.target.value)}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="md:col-span-3 grid gap-3 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Durchführung von
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                        value={data.durchfuehrungszeit_von ?? ""}
                        onChange={(e) => update("durchfuehrungszeit_von", e.target.value)}
                        onFocus={(e) => openNativePicker(e.currentTarget)}
                        onClick={(e) => openNativePicker(e.currentTarget)}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0"
                        onClick={() => update("durchfuehrungszeit_von", getTodayDateInputValue())}
                      >
                        Heute
                      </button>
                    </div>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Durchführung bis
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                        value={data.durchfuehrungszeit_bis ?? ""}
                        onChange={(e) => update("durchfuehrungszeit_bis", e.target.value)}
                        onFocus={(e) => openNativePicker(e.currentTarget)}
                        onClick={(e) => openNativePicker(e.currentTarget)}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0"
                        onClick={() => update("durchfuehrungszeit_bis", getTodayDateInputValue())}
                      >
                        Heute
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            </Card>
          )
        : null}

      {showStep(1)
        ? renderStep(
            <Card title="Bohrung / Verrohrung">
              <div className="grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[180px]">
                  <Field label="Bohrung Nr." value={data.bohrung_nr} onChange={(v) => update("bohrung_nr", v)} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">Eine Zeile pro Bohrverfahren</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                      onClick={() => setBohrungen((prev) => [...prev, emptyBohrungEntry()])}
                    >
                      + Bohrverfahren
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                      onClick={() =>
                        setBohrungen((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
                      }
                      disabled={bohrungen.length <= 1}
                    >
                      - Bohrverfahren
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {bohrungen.map((entry, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-3"
                    >
                      <div className="grid gap-3 xl:grid-cols-[180px_1fr_1fr_120px]">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Verfahren
                          </span>
                          <select
                            className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                            value={entry.verfahren}
                            onChange={(e) =>
                              setBohrungen((prev) => {
                                const next = [...prev];
                                const nextVerfahren = normalizeBohrverfahren(e.target.value);
                                const currentDurchmesser = next[idx].verrohr_durchmesser ?? "";
                                const nextDurchmesserOptions = getDurchmesserOptionsForVerfahren(nextVerfahren);
                                const isGreifDurchmesser = GREIF_DURCHMESSER_OPTIONS.includes(
                                  currentDurchmesser as (typeof GREIF_DURCHMESSER_OPTIONS)[number]
                                );
                                next[idx] = {
                                  ...next[idx],
                                  verfahren: nextVerfahren,
                                  verrohr_durchmesser:
                                    nextVerfahren === "ek_dks"
                                      ? "146"
                                      : nextVerfahren === "greif"
                                      ? isGreifDurchmesser
                                        ? currentDurchmesser
                                        : ""
                                      : nextDurchmesserOptions.includes(currentDurchmesser)
                                      ? currentDurchmesser
                                      : "",
                                };
                                return next;
                              })
                            }
                          >
                            <option value="ramm">Rammkernbohrung</option>
                            <option value="greif">Greifverbohrung</option>
                            <option value="rotation">Rotationskernbohrung</option>
                            <option value="ek_dks">EK-DK-S</option>
                            <option value="voll">Vollbohrung</option>
                          </select>
                        </label>
                        <Field
                          label={
                            entry.verfahren === "ek_dks"
                              ? "Bohrung Ø (mm)"
                              : "Bohrung bis (m)"
                          }
                          value={entry.bohrung_bis}
                          onChange={(v) =>
                            setBohrungen((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], bohrung_bis: v };
                              return next;
                            })
                          }
                        />
                        <Field
                          label="Verrohrt bis (m)"
                          value={entry.verrohrt_bis}
                          onChange={(v) =>
                            setBohrungen((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], verrohrt_bis: v };
                              return next;
                            })
                          }
                        />
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Ø (mm)
                          </span>
                          <select
                            className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                            value={entry.verrohr_durchmesser ?? ""}
                            onChange={(e) =>
                              setBohrungen((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], verrohr_durchmesser: e.target.value };
                                return next;
                              })
                            }
                          >
                            <option value="">Bitte wählen…</option>
                            {getDurchmesserOptionsForVerfahren(entry.verfahren).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )
        : null}

      {showStep(2)
        ? renderStep(
            <Card title="Grundwasserstände">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">Max. {MAX_GROUNDWATER_ROWS} Zeilen</div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              onClick={() =>
                setGrundwasserRows((prev) =>
                  prev.length >= MAX_GROUNDWATER_ROWS ? prev : [...prev, emptyGroundwaterRow()]
                )
              }
              disabled={grundwasserRows.length >= MAX_GROUNDWATER_ROWS}
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
            <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-3">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Messung {idx + 1}
              </div>
              <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr]">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Grundwasserstand
                  </span>
                  <select
                    className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={row.grundwasserstand ?? ""}
                    onChange={(e) =>
                      setGrundwasserRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], grundwasserstand: e.target.value };
                        return next;
                      })
                    }
                  >
                    <option value="">Bitte wählen…</option>
                    {GRUNDWASSERSTAND_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {row.grundwasserstand &&
                    !GRUNDWASSERSTAND_OPTIONS.includes(
                      row.grundwasserstand as (typeof GRUNDWASSERSTAND_OPTIONS)[number]
                    ) ? (
                      <option value={row.grundwasserstand}>{row.grundwasserstand}</option>
                    ) : null}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Datum
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={toDateInputValue(row.datum)}
                      onChange={(e) =>
                        setGrundwasserRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], datum: fromDateInputValue(e.target.value) };
                          return next;
                        })
                      }
                      onFocus={(e) => openNativePicker(e.currentTarget)}
                      onClick={(e) => openNativePicker(e.currentTarget)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0"
                      onClick={() =>
                        setGrundwasserRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], datum: fromDateInputValue(getTodayDateInputValue()) };
                          return next;
                        })
                      }
                    >
                      Heute
                    </button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Uhrzeit
                  </span>
                  <input
                    type="time"
                    className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    value={toTimeInputValue(row.uhrzeit)}
                    onChange={(e) =>
                      setGrundwasserRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], uhrzeit: e.target.value };
                        return next;
                      })
                    }
                    onFocus={(e) => openNativePicker(e.currentTarget)}
                    onClick={(e) => openNativePicker(e.currentTarget)}
                  />
                </label>
                <Field
                  label="Tiefe (GW)"
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
            </div>
          ))}
        </div>
            </Card>
          )
        : null}

      {showStep(3)
        ? renderStep(
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Card title="Pegelrohr / Ausbau">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-1 lg:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Pegelrohr Ø
                    </span>
                    <select
                      className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={data.pegel_durchmesser ?? ""}
                      onChange={(e) => update("pegel_durchmesser", e.target.value)}
                    >
                      <option value="">Pegel Ø</option>
                      {pegelDurchmesserAllowedOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                  {data.pegel_durchmesser ? (
                    <>
                      <Field label="GOK" value={data.rok} onChange={(v) => update("rok", v)} />
                      <Field label="Sumpfrohr (m)" value={data.sumpf} onChange={(v) => update("sumpf", v)} />
                      <Field label="Filterrohr (m)" value={data.filter_rohr} onChange={(v) => update("filter_rohr", v)} />
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Schlitzweite (SW)
                        </span>
                        <div className="grid gap-2">
                          <select
                            className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                            value={schlitzweiteMode === "custom" ? "__custom__" : data.sw || ""}
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setSchlitzweiteMode("custom");
                                update("sw", "");
                                return;
                              }
                              setSchlitzweiteMode("list");
                              update("sw", e.target.value);
                            }}
                          >
                            <option value="">Bitte wählen…</option>
                            {SCHLITZWEITE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                            <option value="__custom__">Eigene Schlitzweite…</option>
                          </select>
                          {schlitzweiteMode === "custom" ? (
                            <input
                              className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                              placeholder="Eigene Schlitzweite"
                              value={data.sw ?? ""}
                              onChange={(e) => update("sw", e.target.value)}
                            />
                          ) : null}
                        </div>
                      </label>
                      <Field label="Vollrohr PVC (m)" value={data.vollrohr_pvc} onChange={(v) => update("vollrohr_pvc", v)} />
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Oberflächenabschluss
                        </span>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={vollrohrStahlLage === "ueberflur"}
                              onChange={() =>
                                setData((prev) => ({
                                  ...prev,
                                  vollrohr_stahl_lage: "ueberflur",
                                  passavant: "",
                                }))
                              }
                            />
                            Überflur
                          </label>
                          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={vollrohrStahlLage === "unterflur"}
                              onChange={() => {
                                setData((prev) => ({
                                  ...prev,
                                  vollrohr_stahl_lage: "unterflur",
                                  vollrohr_stahl: "",
                                  betonsockel: "",
                                }));
                              }}
                            />
                            Unterflur
                          </label>
                        </div>
                      </div>
                      {vollrohrStahlLage === "ueberflur" ? (
                        <Field
                          label="Vollrohr Stahl (m)"
                          value={data.vollrohr_stahl}
                          onChange={(v) => update("vollrohr_stahl", v)}
                        />
                      ) : (
                        <div />
                      )}
                    </>
                  ) : null}
                </div>
              </Card>

              {data.pegel_durchmesser ? (
                <Card title="Passavant / Seba / Beton / Kompaktkappe">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {vollrohrStahlLage !== "ueberflur" ? (
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(data.passavant?.trim())}
                          onChange={(e) => toggleMark("passavant", e.target.checked)}
                        />
                        Passavant
                      </label>
                    ) : null}
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(data.seba?.trim())}
                        onChange={(e) => toggleMark("seba", e.target.checked)}
                      />
                      Seba
                    </label>
                    {vollrohrStahlLage !== "unterflur" ? (
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(data.betonsockel?.trim())}
                          onChange={(e) => toggleMark("betonsockel", e.target.checked)}
                        />
                        Betonsockel
                      </label>
                    ) : null}
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(data.kompaktkappe?.trim())}
                        onChange={(e) => toggleMark("kompaktkappe", e.target.checked)}
                      />
                      Kompaktkappe
                    </label>
                  </div>
                </Card>
              ) : (
                <div />
              )}
            </section>
          )
        : null}

      {showStep(4)
        ? renderStep(
            <Card title="Filter / Dichtung / Bohrgut">
              <div className="space-y-4">
                <div className="text-xs text-slate-500">
                  Jede Gruppe ist separat erweiterbar. In der PDF stehen die Werte je Gruppe untereinander im gleichen Kasten.
                </div>
                <div className="space-y-3">
                  {FILTER_PAIR_CONFIG.map((cfg) => {
                    const entries = getFilterPairEntries(cfg.id, cfg.vonKey, cfg.bisKey);
                    return (
                      <div key={cfg.id} className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            {cfg.title}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                              onClick={() =>
                                setFilterPairEntries(cfg.id, cfg.vonKey, cfg.bisKey, [
                                  ...entries,
                                  { von: "", bis: "" },
                                ])
                              }
                            >
                              + Zeile
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                              onClick={() =>
                                setFilterPairEntries(
                                  cfg.id,
                                  cfg.vonKey,
                                  cfg.bisKey,
                                  entries.slice(0, -1)
                                )
                              }
                              disabled={entries.length <= 1}
                            >
                              - Zeile
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {entries.map((entry, idx) => (
                            <div key={`${cfg.id}-${idx}`} className="grid gap-4 lg:grid-cols-2">
                              <Field
                                label={idx === 0 ? cfg.vonLabel : `${cfg.vonLabel} ${idx + 1}`}
                                value={entry.von}
                                onChange={(v) => {
                                  const next = [...entries];
                                  next[idx] = { ...next[idx], von: v };
                                  setFilterPairEntries(cfg.id, cfg.vonKey, cfg.bisKey, next);
                                }}
                              />
                              <Field
                                label={idx === 0 ? cfg.bisLabel : `${cfg.bisLabel} ${idx + 1}`}
                                value={entry.bis}
                                onChange={(v) => {
                                  const next = [...entries];
                                  next[idx] = { ...next[idx], bis: v };
                                  setFilterPairEntries(cfg.id, cfg.vonKey, cfg.bisKey, next);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        {cfg.id === "filterkies" ? (
                          <div className="mt-3">
                            <label className="space-y-1">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Kies-Körnung
                              </span>
                              <select
                                className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                                value={kiesKoernungMode === "custom" ? "__custom__" : data.kies_koernung || ""}
                                onChange={(e) => {
                                  if (e.target.value === "__custom__") {
                                    setKiesKoernungMode("custom");
                                    update("kies_koernung", "");
                                    return;
                                  }
                                  setKiesKoernungMode("list");
                                  update("kies_koernung", e.target.value);
                                }}
                              >
                                <option value="">Bitte wählen…</option>
                                {KIES_KOERNUNG_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                <option value="__custom__">Eigene Körnung…</option>
                              </select>
                              {kiesKoernungMode === "custom" ? (
                                <input
                                  className="mt-2 h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                                  placeholder="Eigene Kies-Körnung"
                                  value={data.kies_koernung ?? ""}
                                  onChange={(e) => update("kies_koernung", e.target.value)}
                                />
                              ) : null}
                            </label>
                          </div>
                        ) : null}
                        {cfg.id === "gegenfilter" ? (
                          <div className="mt-3">
                            <label className="space-y-1">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Kies-Körnung
                              </span>
                              <select
                                className="h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                                value={
                                  gegenfilterKoernungMode === "custom"
                                    ? "__custom__"
                                    : data.gegenfilter_koernung || ""
                                }
                                onChange={(e) => {
                                  if (e.target.value === "__custom__") {
                                    setGegenfilterKoernungMode("custom");
                                    update("gegenfilter_koernung", "");
                                    return;
                                  }
                                  setGegenfilterKoernungMode("list");
                                  update("gegenfilter_koernung", e.target.value);
                                }}
                              >
                                <option value="">Bitte wählen…</option>
                                {KIES_KOERNUNG_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                <option value="__custom__">Eigene Körnung…</option>
                              </select>
                              {gegenfilterKoernungMode === "custom" ? (
                                <input
                                  className="mt-2 h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                                  placeholder="Eigene Kies-Körnung"
                                  value={data.gegenfilter_koernung ?? ""}
                                  onChange={(e) => update("gegenfilter_koernung", e.target.value)}
                                />
                              ) : null}
                            </label>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )
        : null}

      {showStep(5)
        ? renderStep(
            <Card title="Schichtbeschreibung (Auszug)">
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
            Legende / Hilfe (Original‑Hinweise)
          </summary>
          <div className="px-3 pb-3 text-sm text-slate-600">
            <div className="grid gap-2 xl:grid-cols-[0.8fr_2.6fr_1.2fr_0.6fr_0.6fr_0.6fr]">
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
                <div className="text-xs font-semibold text-slate-700">Feststellungen beim Bohren</div>
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
        <div className="mt-4 space-y-4">
          {schichtRows.map((row, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200/80 bg-slate-50/30 p-3"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Schichtzeile {idx + 1}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    onClick={() =>
                      setSchichtRows((prev) => {
                        const clone = {
                          ...prev[idx],
                          proben_tiefen: Array.isArray(prev[idx].proben_tiefen)
                            ? [...prev[idx].proben_tiefen]
                            : [""],
                          proben_arten: Array.isArray(prev[idx].proben_arten)
                            ? [...prev[idx].proben_arten]
                            : ["GP"],
                        };
                        return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
                      })
                    }
                  >
                    Duplizieren
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    onClick={() =>
                      setSchichtRows((prev) => (prev.length > 1 ? prev.filter((_, rowIndex) => rowIndex !== idx) : prev))
                    }
                    disabled={schichtRows.length <= 1}
                  >
                    Entfernen
                  </button>
                </div>
              </div>
              <div
                className="grid gap-4 2xl:grid-cols-[1.4fr_0.9fr_0.4fr]"
                style={{
                  minHeight: `${Number(schichtRowHeight) || 200}px`,
                }}
              >
              <div>
              <div className="rounded-xl border border-slate-200 h-full bg-white">
                <div className="grid h-full xl:grid-cols-[0.35fr_1fr]">
                  <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600 xl:border-b-0 xl:border-r">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_0.6fr] text-xs text-slate-600">
                    <div className="col-span-full 2xl:col-span-4 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Schichtbeschreibung
                    </div>
                    <label className="col-span-full 2xl:col-span-4 border-b border-slate-200 px-3 py-2">
                      a1) Benennung
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
                    <label className="col-span-full 2xl:col-span-4 border-b border-slate-200 px-3 py-2">
                      a2) Bemerkung
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
                      b) Bohrgut
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
                      c) Bohrvorgang
                      <select
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={
                          row.c === ""
                            ? ""
                            : SCHICHT_C_OPTIONS.includes(row.c as (typeof SCHICHT_C_OPTIONS)[number])
                              ? row.c
                              : "__custom__"
                        }
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx],
                              c: e.target.value === "__custom__" ? "individuell" : e.target.value,
                            };
                            return next;
                          })
                        }
                      >
                        <option value="">Bitte wählen…</option>
                        {SCHICHT_C_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        <option value="__custom__">individuell</option>
                      </select>
                      {(
                        row.c === "individuell" ||
                        (!SCHICHT_C_OPTIONS.includes(row.c as (typeof SCHICHT_C_OPTIONS)[number]) &&
                          row.c !== "")
                      ) ? (
                        <input
                          className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          value={row.c === "individuell" ? "" : row.c}
                          onChange={(e) =>
                            setSchichtRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], c: e.target.value };
                              return next;
                            })
                          }
                          placeholder="Individueller Bohrvorgang"
                        />
                      ) : null}
                    </label>
                    <label className="border-b border-r border-slate-200 px-3 py-2">
                      d) Farbe
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
                        placeholder="Farbe eingeben"
                      />
                    </label>
                    <div className="hidden 2xl:block border-b border-slate-200 px-3 py-2" />
                    <label className="border-r border-slate-200 px-3 py-2">
                      f) Ortsüblich
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
                      g) Geologisch
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
                      h) Gruppe
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
                      e) Kalkgehalt
                      <select
                        className="mt-1 h-7 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={row.e}
                        onChange={(e) =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], e: e.target.value };
                            return next;
                          })
                        }
                      >
                        <option value="">Bitte wählen…</option>
                        {SCHICHT_E_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 h-full flex flex-col">
                <div className="text-xs font-semibold text-slate-600">Feststellungen beim Bohren</div>
                <textarea
                  className="mt-2 h-28 min-h-[96px] max-h-40 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                <label className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={(row.spt_eintraege?.length ?? 0) > 0}
                    onChange={(e) =>
                      setSchichtRows((prev) => {
                        const next = [...prev];
                        if (e.target.checked) {
                          const entries = Array.isArray(next[idx].spt_eintraege)
                            ? [...next[idx].spt_eintraege]
                            : [];
                          const normalizedEntries = entries.length > 0 ? entries : [emptySptEntry()];
                          const first = normalizedEntries[0] ?? emptySptEntry();
                          next[idx] = {
                            ...next[idx],
                            spt_gemacht: true,
                            spt_eintraege: normalizedEntries,
                            spt_schlag_1: first.schlag_1,
                            spt_schlag_2: first.schlag_2,
                            spt_schlag_3: first.schlag_3,
                          };
                        } else {
                          next[idx] = {
                            ...next[idx],
                            spt_gemacht: false,
                            spt_eintraege: [],
                            spt_schlag_1: "",
                            spt_schlag_2: "",
                            spt_schlag_3: "",
                          };
                        }
                        return next;
                      })
                    }
                  />
                  SPT durchgeführt
                </label>
                {(row.spt_eintraege?.length ?? 0) > 0 ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Schlagzahlen
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                          onClick={() =>
                            setSchichtRows((prev) => {
                              const next = [...prev];
                              const entries = Array.isArray(next[idx].spt_eintraege)
                                ? [...next[idx].spt_eintraege]
                                : [];
                              if (entries.length >= 6) return prev;
                              entries.push(emptySptEntry());
                              const first = entries[0] ?? emptySptEntry();
                              next[idx] = {
                                ...next[idx],
                                spt_gemacht: true,
                                spt_eintraege: entries,
                                spt_schlag_1: first.schlag_1,
                                spt_schlag_2: first.schlag_2,
                                spt_schlag_3: first.schlag_3,
                              };
                              return next;
                            })
                          }
                          disabled={(row.spt_eintraege?.length ?? 0) >= 6}
                        >
                          + SPT
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                          onClick={() =>
                            setSchichtRows((prev) => {
                              const next = [...prev];
                              const entries = Array.isArray(next[idx].spt_eintraege)
                                ? [...next[idx].spt_eintraege]
                                : [];
                              if (entries.length <= 1) return prev;
                              entries.pop();
                              const first = entries[0] ?? emptySptEntry();
                              next[idx] = {
                                ...next[idx],
                                spt_gemacht: true,
                                spt_eintraege: entries,
                                spt_schlag_1: first.schlag_1,
                                spt_schlag_2: first.schlag_2,
                                spt_schlag_3: first.schlag_3,
                              };
                              return next;
                            })
                          }
                          disabled={(row.spt_eintraege?.length ?? 0) <= 1}
                        >
                          - SPT
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(Array.isArray(row.spt_eintraege) ? row.spt_eintraege : [])
                        .slice(0, 6)
                        .map((entry, sptIndex) => (
                          <div
                            key={sptIndex}
                            className="rounded-md border border-slate-200 bg-white p-2"
                          >
                            {(() => {
                              const computedBis = computeSptBisFromEntry(entry);
                              return (
                                <>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              SPT {sptIndex + 1}
                            </div>
                            <div className="mb-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                              <input
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                placeholder="von (m)"
                                value={entry?.von_m ?? ""}
                                onChange={(e) =>
                                  setSchichtRows((prev) => {
                                    const next = [...prev];
                                    const entries = Array.isArray(next[idx].spt_eintraege)
                                      ? [...next[idx].spt_eintraege]
                                      : [emptySptEntry()];
                                    const current = entries[sptIndex] ?? emptySptEntry();
                                    const nextEntry = { ...current, von_m: e.target.value };
                                    entries[sptIndex] = {
                                      ...nextEntry,
                                      bis_m: computeSptBisFromEntry(nextEntry),
                                    };
                                    const first = entries[0] ?? emptySptEntry();
                                    next[idx] = {
                                      ...next[idx],
                                      spt_gemacht: entries.length > 0,
                                      spt_eintraege: entries,
                                      spt_schlag_1: first.schlag_1,
                                      spt_schlag_2: first.schlag_2,
                                      spt_schlag_3: first.schlag_3,
                                    };
                                    return next;
                                  })
                                }
                              />
                              <span className="text-[10px] font-semibold text-slate-500">bis</span>
                              <div className="h-8 rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-700 flex items-center">
                                {computedBis || "automatisch"}
                              </div>
                              <span className="text-[10px] text-slate-500">m</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                placeholder="Schlagzahl max. 50"
                                value={entry?.schlag_1 ?? ""}
                                onChange={(e) =>
                                  setSchichtRows((prev) => {
                                    const next = [...prev];
                                    const entries = Array.isArray(next[idx].spt_eintraege)
                                      ? [...next[idx].spt_eintraege]
                                      : [emptySptEntry()];
                                    const current = entries[sptIndex] ?? emptySptEntry();
                                    const nextEntry = { ...current, schlag_1: e.target.value };
                                    entries[sptIndex] = {
                                      ...nextEntry,
                                      bis_m: computeSptBisFromEntry(nextEntry),
                                    };
                                    const first = entries[0] ?? emptySptEntry();
                                    next[idx] = {
                                      ...next[idx],
                                      spt_gemacht: entries.length > 0,
                                      spt_eintraege: entries,
                                      spt_schlag_1: first.schlag_1,
                                      spt_schlag_2: first.schlag_2,
                                      spt_schlag_3: first.schlag_3,
                                    };
                                    return next;
                                  })
                                }
                              />
                              <input
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                placeholder="Schlagzahl max. 50"
                                value={entry?.schlag_2 ?? ""}
                                onChange={(e) =>
                                  setSchichtRows((prev) => {
                                    const next = [...prev];
                                    const entries = Array.isArray(next[idx].spt_eintraege)
                                      ? [...next[idx].spt_eintraege]
                                      : [emptySptEntry()];
                                    const current = entries[sptIndex] ?? emptySptEntry();
                                    const nextEntry = { ...current, schlag_2: e.target.value };
                                    entries[sptIndex] = {
                                      ...nextEntry,
                                      bis_m: computeSptBisFromEntry(nextEntry),
                                    };
                                    const first = entries[0] ?? emptySptEntry();
                                    next[idx] = {
                                      ...next[idx],
                                      spt_gemacht: entries.length > 0,
                                      spt_eintraege: entries,
                                      spt_schlag_1: first.schlag_1,
                                      spt_schlag_2: first.schlag_2,
                                      spt_schlag_3: first.schlag_3,
                                    };
                                    return next;
                                  })
                                }
                              />
                              <input
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                placeholder="Schlagzahl max. 50"
                                value={entry?.schlag_3 ?? ""}
                                onChange={(e) =>
                                  setSchichtRows((prev) => {
                                    const next = [...prev];
                                    const entries = Array.isArray(next[idx].spt_eintraege)
                                      ? [...next[idx].spt_eintraege]
                                      : [emptySptEntry()];
                                    const current = entries[sptIndex] ?? emptySptEntry();
                                    const nextEntry = { ...current, schlag_3: e.target.value };
                                    entries[sptIndex] = {
                                      ...nextEntry,
                                      bis_m: computeSptBisFromEntry(nextEntry),
                                    };
                                    const first = entries[0] ?? emptySptEntry();
                                    next[idx] = {
                                      ...next[idx],
                                      spt_gemacht: entries.length > 0,
                                      spt_eintraege: entries,
                                      spt_schlag_1: first.schlag_1,
                                      spt_schlag_2: first.schlag_2,
                                      spt_schlag_3: first.schlag_3,
                                    };
                                    return next;
                                  })
                                }
                              />
                            </div>
                                </>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 h-full">
                <div className="text-xs font-semibold text-slate-600">Entnommene Proben</div>
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
                              : [""];
                            const currentTypes = Array.isArray(next[idx].proben_arten)
                              ? [...next[idx].proben_arten]
                              : current.map(() => normalizeProbeType(next[idx].proben_art));
                            if (current.length >= 10) return prev;
                            const defaultType = normalizeProbeType(currentTypes[0] ?? next[idx].proben_art);
                            const previousDepth = String(current[current.length - 1] ?? "");
                            const previousEnd = extractDepthEndValue(previousDepth);
                            const nextDepthSuggestion = previousEnd ? previousEnd : "";
                            current.push(nextDepthSuggestion);
                            currentTypes.push(defaultType);
                            next[idx] = { ...next[idx], proben_tiefen: current, proben_arten: currentTypes };
                            return next;
                          })
                        }
                        disabled={(row.proben_tiefen?.length ?? 1) >= 10}
                      >
                        + Probe
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] hover:bg-slate-50 disabled:opacity-50"
                        onClick={() =>
                          setSchichtRows((prev) => {
                            const next = [...prev];
                            const current = Array.isArray(next[idx].proben_tiefen)
                              ? [...next[idx].proben_tiefen]
                              : [""];
                            const currentTypes = Array.isArray(next[idx].proben_arten)
                              ? [...next[idx].proben_arten]
                              : current.map(() => normalizeProbeType(next[idx].proben_art));
                            if (current.length <= 1) return prev;
                            current.pop();
                            currentTypes.pop();
                            next[idx] = { ...next[idx], proben_tiefen: current, proben_arten: currentTypes };
                            return next;
                          })
                        }
                        disabled={(row.proben_tiefen?.length ?? 1) <= 1}
                      >
                        – Probe
                      </button>
                    </div>
                  </div>
                  {(Array.isArray(row.proben_tiefen) ? row.proben_tiefen : [""])
                    .slice(0, 10)
                    .map((_, i) => {
                      const depthValue = row.proben_tiefen?.[i] ?? "";
                      const splitDepth = splitDepthRange(depthValue);
                      return (
                      <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[92px_1fr]">
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                          value={normalizeProbeType(row.proben_arten?.[i] ?? row.proben_art)}
                          onChange={(e) =>
                            setSchichtRows((prev) => {
                              const next = [...prev];
                              const currentTypes = Array.isArray(next[idx].proben_arten)
                                ? [...next[idx].proben_arten]
                                : (Array.isArray(next[idx].proben_tiefen)
                                    ? next[idx].proben_tiefen
                                    : [""]).map(() => normalizeProbeType(next[idx].proben_art));
                              currentTypes[i] = normalizeProbeType(e.target.value);
                              next[idx] = {
                                ...next[idx],
                                proben_arten: currentTypes,
                                proben_art: currentTypes[0] ?? normalizeProbeType(next[idx].proben_art),
                              };
                              return next;
                            })
                          }
                        >
                          <option value="GP">GP</option>
                          <option value="EP">EP</option>
                          <option value="UP">UP</option>
                          <option value="BG">BG</option>
                        </select>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                            placeholder={`Von ${i + 1}`}
                            value={splitDepth.from}
                            onChange={(e) =>
                              setSchichtRows((prev) => {
                                const next = [...prev];
                                const current = Array.isArray(next[idx].proben_tiefen)
                                  ? [...next[idx].proben_tiefen]
                                  : [""];
                                current[i] = joinDepthRange(e.target.value, splitDepth.to);
                                next[idx] = { ...next[idx], proben_tiefen: current };
                                return next;
                              })
                            }
                          />
                          <span className="text-sm font-semibold text-slate-500">-</span>
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                            placeholder={`Bis ${i + 1}`}
                            value={splitDepth.to}
                            onChange={(e) =>
                              setSchichtRows((prev) => {
                                const next = [...prev];
                                const current = Array.isArray(next[idx].proben_tiefen)
                                  ? [...next[idx].proben_tiefen]
                                  : [""];
                                const newTo = e.target.value;
                                current[i] = joinDepthRange(splitDepth.from, newTo);
                                if (i + 1 < current.length) {
                                  const nextSplit = splitDepthRange(current[i + 1] ?? "");
                                  current[i + 1] = joinDepthRange(newTo, nextSplit.to);
                                }
                                next[idx] = { ...next[idx], proben_tiefen: current };
                                return next;
                              })
                            }
                          />
                        </div>
                      </div>
                    )})}
                </div>
              </div>
            </div>
            </div>
          ))}
        </div>
            </Card>
          )
        : null}

      {showStep(6)
        ? renderStep(
            <Card title="Proben / Übergabe">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="min-w-0 space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Übergeben am
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                      value={toDateInputValue(data.uebergeben_am)}
                      onChange={(e) => update("uebergeben_am", fromDateInputValue(e.target.value))}
                      onFocus={(e) => openNativePicker(e.currentTarget)}
                      onClick={(e) => openNativePicker(e.currentTarget)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0"
                      onClick={() => update("uebergeben_am", fromDateInputValue(getTodayDateInputValue()))}
                    >
                      Heute
                    </button>
                  </div>
                </label>
                <Field label="Übergeben an" value={data.uebergeben_an} onChange={(v) => update("uebergeben_an", v)} />
              </div>
            </Card>
          )
        : null}

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
            className="btn btn-danger"
            onClick={resetAllInputs}
          >
            Alles löschen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openPdf}
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
              Final speichern
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (stepIndex === 5 && !ensureRequiredSchichtfelder()) return;
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-sky-50/60 px-4 py-2 border-b border-slate-200/70">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {title}
        </h3>
      </div>
      <div className="min-w-0 overflow-x-hidden p-4">{children}</div>
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
    <label className={`min-w-0 space-y-1 ${className ?? ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <input
        className="w-full max-w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
