import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { SV_FIELDS } from "@/lib/pdf/schichtenverzeichnis.mapping";
import {
  DEFAULT_FIELD_OFFSETS_PAGE_1,
  DEFAULT_ROW_FIELD_OFFSETS_PAGE_1,
} from "@/lib/pdf/schichtenverzeichnis.default-offsets";

type GenerateOptions = {
  debugGrid?: boolean;
  debugGridStep?: number;
  debugGridPage?: number;
  markers?: Array<{
    page: number;
    x: number;
    y: number;
    text?: string;
    size?: number;
  }>;
};

const TEMPLATE_PAGE_1 = "SV_1.pdf" as const;
const TEMPLATE_PAGE_N = "SV_2.pdf" as const;
const HIDDEN_FIELD_KEYS = new Set([
  "hoehe_ansatzpunkt",
  "bezogen_auf",
  "gitterwert",
  "gitterwert_rechts",
  "gitterwert_links",
  "eingemessen_durch",
]);
const MARKER_HIGHLIGHT_KEYS = new Set(["passavant", "seba", "betonsockel"]);

function getTemplatePath(fileName: string) {
  return path.join(process.cwd(), "public", "templates", fileName);
}

function drawGrid(page: any, font: any, step = 50) {
  const width = page.getWidth();
  const height = page.getHeight();

  for (let x = 0; x <= width; x += step) {
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    page.drawText(String(x), {
      x: x + 2,
      y: height - 10,
      size: 6,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  for (let y = 0; y <= height; y += step) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    page.drawText(String(y), {
      x: 2,
      y: y + 2,
      size: 6,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }
}

function drawMarker(page: any, font: any, marker: { x: number; y: number; text?: string; size?: number }) {
  const size = marker.size ?? 10;
  if (!marker.text) return;
  page.drawText(marker.text, {
    x: marker.x,
    y: marker.y,
    size,
    font,
    color: rgb(0.85, 0.1, 0.1),
  });
}

export async function generateSchichtenverzeichnisPdf(
  data: any,
  options: GenerateOptions = {}
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const hasRowData = Array.isArray(data?.schicht_rows) && data.schicht_rows.length > 0;
  const fallbackRowsPerPage = Math.max(1, Number(data?.schicht_rows_per_page) || 4);
  const rowsPerPagePage1 = Math.max(
    1,
    Number(data?.schicht_rows_per_page_1) || fallbackRowsPerPage
  );
  const rowsPerPagePageN = Math.max(
    1,
    Number(data?.schicht_rows_per_page_2) || fallbackRowsPerPage
  );
  const rowCount = hasRowData ? data.schicht_rows.length : 0;
  const remainingAfterPage1 = Math.max(0, rowCount - rowsPerPagePage1);
  const requiredPageNCopies = hasRowData
    ? Math.max(1, Math.ceil(remainingAfterPage1 / rowsPerPagePageN))
    : 1;

  const pages: Array<ReturnType<typeof outDoc.addPage>> = [];

  const page1TemplatePath = getTemplatePath(TEMPLATE_PAGE_1);
  if (!fs.existsSync(page1TemplatePath)) {
    throw new Error(`Template PDF not found at: ${page1TemplatePath}`);
  }
  const page1TemplateBytes = fs.readFileSync(page1TemplatePath);
  const page1SrcDoc = await PDFDocument.load(page1TemplateBytes);
  const [firstPage] = await outDoc.copyPages(page1SrcDoc, [0]);
  outDoc.addPage(firstPage);
  pages.push(firstPage);

  const pageNTemplatePath = getTemplatePath(TEMPLATE_PAGE_N);
  if (!fs.existsSync(pageNTemplatePath)) {
    throw new Error(`Template PDF not found at: ${pageNTemplatePath}`);
  }
  const pageNTemplateBytes = fs.readFileSync(pageNTemplatePath);
  const pageNSrcDoc = await PDFDocument.load(pageNTemplateBytes);
  for (let i = 0; i < requiredPageNCopies; i += 1) {
    const [pageN] = await outDoc.copyPages(pageNSrcDoc, [0]);
    outDoc.addPage(pageN);
    pages.push(pageN);
  }

  if (options.debugGrid) {
    const step = options.debugGridStep ?? 50;
    if (options.debugGridPage && options.debugGridPage >= 1) {
      const page = pages[Math.max(0, Math.min(pages.length - 1, options.debugGridPage - 1))];
      if (page) drawGrid(page, font, step);
    } else {
      pages.forEach((page) => drawGrid(page, font, step));
    }
  }

  if (options.markers && options.markers.length) {
    options.markers.forEach((marker) => {
      const page = pages[Math.max(0, Math.min(pages.length - 1, marker.page - 1))];
      if (!page) return;
      drawMarker(page, font, marker);
    });
  }

  const drawText = (pageIndex: number, text: string, x: number, y: number, size = 10) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawText(text ?? "", { x, y, size, font, color: rgb(0, 0.35, 0.9) });
  };
  const drawHighlight = (
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(0.45, 0.82, 1),
      opacity: 0.35,
      borderWidth: 0,
    });
  };
  const drawStaticText = (pageIndex: number, text: string, x: number, y: number, size = 10) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawText(text ?? "", { x, y, size, font, color: rgb(0, 0, 0) });
  };
  const buildBohrungen = () => {
    const normalizeType = (value: unknown) => {
      const raw = String(value ?? "").trim().toLowerCase();
      if (raw === "rotation") return "rotation";
      if (raw === "ek_dks") return "ek_dks";
      if (raw === "voll") return "voll";
      return "ramm";
    };
    const parseDiameter = (value: string) => {
      const cleaned = String(value ?? "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };
    const sortBohrungen = (
      input: Array<{
        verfahren: string;
        bohrung_bis: string;
        verrohrt_bis: string;
        verrohr_durchmesser: string;
      }>
    ) =>
      [...input].sort((a, b) => {
        const aVoll = a.verfahren === "voll";
        const bVoll = b.verfahren === "voll";
        if (aVoll && !bVoll) return 1;
        if (!aVoll && bVoll) return -1;

        const aDiameter = parseDiameter(a.verrohr_durchmesser);
        const bDiameter = parseDiameter(b.verrohr_durchmesser);
        if (aDiameter !== bDiameter) return aDiameter - bDiameter;
        return 0;
      });

    const fromArray = Array.isArray(data?.bohrungen)
      ? data.bohrungen
          .map((entry: any) => ({
            verfahren: normalizeType(entry?.verfahren),
            bohrung_bis: String(entry?.bohrung_bis ?? "").trim(),
            verrohrt_bis: String(entry?.verrohrt_bis ?? "").trim(),
            verrohr_durchmesser: String(entry?.verrohr_durchmesser ?? "").trim(),
          }))
          .filter((entry: any) => entry.bohrung_bis || entry.verrohrt_bis || entry.verrohr_durchmesser)
      : [];
    if (fromArray.length > 0) return sortBohrungen(fromArray);
    return sortBohrungen([
      {
        verfahren: "ramm",
        bohrung_bis: String(data?.rammbohrung ?? "").trim(),
        verrohrt_bis: String(data?.verrohrt_bis_1 ?? "").trim(),
        verrohr_durchmesser: String(data?.verrohr_durch_1 ?? "").trim(),
      },
      {
        verfahren: "rotation",
        bohrung_bis: String(data?.rotationskernbohrung ?? "").trim(),
        verrohrt_bis: String(data?.verrohrt_bis_2 ?? "").trim(),
        verrohr_durchmesser: String(data?.verrohr_durch_2 ?? "").trim(),
      },
      {
        verfahren: "ek_dks",
        bohrung_bis: String(data?.ek_dks ?? "").trim(),
        verrohrt_bis: String(data?.verrohrt_bis_3 ?? "").trim(),
        verrohr_durchmesser: String(data?.verrohr_durch_3 ?? "").trim(),
      },
      {
        verfahren: "voll",
        bohrung_bis: String(data?.vollbohrung ?? "").trim(),
        verrohrt_bis: String(data?.verrohrt_bis_4 ?? "").trim(),
        verrohr_durchmesser: String(data?.verrohr_durch_4 ?? "").trim(),
      },
    ].filter((entry) => entry.bohrung_bis || entry.verrohrt_bis || entry.verrohr_durchmesser));
  };
  const drawBohrungenBlock = () => {
    const rows = buildBohrungen().slice(0, 6);
    const labelMap: Record<string, string> = {
      ramm: "Rammkernbohrung",
      rotation: "Rotationskernbohrung",
      ek_dks: "EK-DK-S",
      voll: "Vollbohrung",
    };
    const leftLabelX = 235;
    const leftValueX = 343;
    const rightLabelX = 410;
    const rightValueX = 460;
    const rightDiameterX = 514;
    const startY = 756;
    const stepY = 13;
    const labelSize = 8.5;
    const valueSize = 9;

    rows.forEach((row: any, idx: number) => {
      const y = startY - idx * stepY;
      const isEkdks = row.verfahren === "ek_dks";
      drawStaticText(0, labelMap[row.verfahren] ?? "Rammkernbohrung", leftLabelX, y, labelSize);
      drawStaticText(0, isEkdks ? "Ø" : "bis", 325, y, labelSize);
      drawStaticText(0, isEkdks ? "_______mm" : "_______m", 343, y, labelSize);
      drawStaticText(0, "Verrohrt bis", rightLabelX, y, labelSize);
      drawStaticText(0, "_____m", 460, y, labelSize);
      drawStaticText(0, "Ø", 500, y, labelSize);
      drawStaticText(0, "_____mm", 514, y, labelSize);

      if (row.bohrung_bis) drawText(0, row.bohrung_bis, leftValueX, y, valueSize);
      if (row.verrohrt_bis) drawText(0, row.verrohrt_bis, rightValueX, y, valueSize);
      if (row.verrohr_durchmesser) drawText(0, row.verrohr_durchmesser, rightDiameterX, y, valueSize);
    });
  };

  drawBohrungenBlock();

  const wrapText = (text: string, maxWidth: number, size: number) => {
    const words = text.replace(/\r/g, "").split(/\s+/);
    const lines: string[] = [];
    let current = "";

    const pushCurrent = () => {
      if (current) lines.push(current);
      current = "";
    };

    const splitLongWord = (word: string) => {
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) lines.push(chunk);
    };

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        current = next;
        continue;
      }

      if (current) pushCurrent();

      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        splitLongWord(word);
      } else {
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  const drawWrappedText = (
    pageIndex: number,
    text: string,
    x: number,
    yTop: number,
    maxWidth: number,
    maxHeight: number,
    size = 10,
    minLineHeight = 12
  ) => {
    const page = pages[pageIndex];
    if (!page) return;
    const lineHeight = Math.max(minLineHeight, Math.round(size * 1.25));
    const fitEllipsis = (value: string) => {
      if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
      let trimmed = value;
      while (trimmed.length > 0 && font.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
        trimmed = trimmed.slice(0, -1);
      }
      return `${trimmed}…`;
    };
    const paragraphs = text.split("\n");
    const lines: string[] = [];

    paragraphs.forEach((para) => {
      if (!para.trim()) {
        lines.push("");
        return;
      }
      wrapText(para, maxWidth, size).forEach((ln) => lines.push(ln));
    });

    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const sliced = lines.slice(0, maxLines);
    if (lines.length > maxLines && sliced.length) {
      sliced[sliced.length - 1] = fitEllipsis(sliced[sliced.length - 1]);
    }
    sliced.forEach((ln, idx) => {
      page.drawText(ln, {
        x,
        y: yTop - idx * lineHeight,
        size,
        font,
        color: rgb(0, 0.35, 0.9),
      });
    });
  };
  const normalizeProbeArt = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (normalized === "EP") return "EP";
    if (normalized === "UP") return "UP";
    return "GP";
  };
  const getProbeCounterBucket = (probeArt: string) => {
    if (probeArt === "EP") return "KP";
    if (probeArt === "UP") return "SP";
    return "GP";
  };

  const fieldMap = new Map(SV_FIELDS.map((f) => [f.key, f]));
  const LOCKED_ROW_X_FIELDS_PAGE_1 = new Set([
    "schicht_a1",
    "schicht_a2",
    "schicht_b",
    "schicht_c",
    "schicht_d",
    "schicht_e",
    "schicht_f",
    "schicht_g",
    "schicht_h",
  ]);
  const LOCKED_PAGE1_Y_OFFSET_FIELDS = new Set([
    "probe_gp",
    "probe_kp",
    "probe_sp",
    "probe_spt",
  ]);
  const fieldOffsetsPage1 =
    (data?.field_offsets_page_1 as Record<string, { x?: number | string; y?: number | string }>) ||
    {};
  const rowFieldOffsetsPage1 =
    (data?.schicht_row_field_offsets_page_1 as Record<
      string,
      Record<string, { x?: number | string; y?: number | string }>
    >) || {};
  const getPage1FieldOffset = (fieldKey: string, axis: "x" | "y") => {
    // Keep probe counters pinned to the calibrated baseline.
    // Older saved reports may carry legacy negative y-offsets that push them out of place.
    if (axis === "y" && LOCKED_PAGE1_Y_OFFSET_FIELDS.has(fieldKey)) {
      return DEFAULT_FIELD_OFFSETS_PAGE_1[fieldKey]?.[axis] ?? 0;
    }
    const hasCustom = fieldOffsetsPage1?.[fieldKey]?.[axis] != null;
    if (hasCustom) {
      return Number(fieldOffsetsPage1[fieldKey][axis]) || 0;
    }
    return DEFAULT_FIELD_OFFSETS_PAGE_1[fieldKey]?.[axis] ?? 0;
  };
  const getRowFieldOffsetPage1 = (rowIndex: number, fieldKey: string, axis: "x" | "y") => {
    const rowKey = String(rowIndex);
    const hasCustom = rowFieldOffsetsPage1?.[rowKey]?.[fieldKey]?.[axis] != null;
    if (hasCustom) {
      return Number(rowFieldOffsetsPage1[rowKey][fieldKey][axis]) || 0;
    }
    return DEFAULT_ROW_FIELD_OFFSETS_PAGE_1[rowKey]?.[fieldKey]?.[axis] ?? 0;
  };
  const getRowFieldOffsetPage1X = (rowIndex: number, fieldKey: string) => {
    if (LOCKED_ROW_X_FIELDS_PAGE_1.has(fieldKey)) return 0;
    return getRowFieldOffsetPage1(rowIndex, fieldKey, "x");
  };
  const skipKeys = new Set([
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
    "grundwasserstand",
    "datum",
    "uhrzeit",
    "tiefe_m",
    "uk_verrohrg",
    "bohrtiefe",
    "rammbohrung",
    "rotationskernbohrung",
    "vollbohrung",
    "ek_dks",
    "verrohrt_bis_1",
    "verrohr_durch_1",
    "verrohrt_bis_2",
    "verrohr_durch_2",
    "verrohrt_bis_3",
    "verrohr_durch_3",
    "verrohrt_bis_4",
    "verrohr_durch_4",
  ]);
  const FILTER_MULTI_KEYS = new Set([
    "filterkies_von",
    "filterkies_bis",
    "tondichtung_von",
    "tondichtung_bis",
    "gegenfilter_von",
    "gegenfilter_bis",
    "tondichtung_von_2",
    "tondichtung_bis_2",
    "zement_bent_von",
    "zement_bent_bis",
    "bohrgut_von",
    "bohrgut_bis",
  ]);
  const buildFilterRows = () => {
    const source = Array.isArray(data?.filter_rows)
      ? data.filter_rows
      : [
          {
            filterkies_von: data?.filterkies_von,
            filterkies_bis: data?.filterkies_bis,
            tondichtung_von: data?.tondichtung_von,
            tondichtung_bis: data?.tondichtung_bis,
            gegenfilter_von: data?.gegenfilter_von,
            gegenfilter_bis: data?.gegenfilter_bis,
            tondichtung_von_2: data?.tondichtung_von_2,
            tondichtung_bis_2: data?.tondichtung_bis_2,
            zement_bent_von: data?.zement_bent_von,
            zement_bent_bis: data?.zement_bent_bis,
            bohrgut_von: data?.bohrgut_von,
            bohrgut_bis: data?.bohrgut_bis,
          },
        ];
    const normalized = source
      .map((row: any) => ({
        filterkies_von: String(row?.filterkies_von ?? "").trim(),
        filterkies_bis: String(row?.filterkies_bis ?? "").trim(),
        tondichtung_von: String(row?.tondichtung_von ?? "").trim(),
        tondichtung_bis: String(row?.tondichtung_bis ?? "").trim(),
        gegenfilter_von: String(row?.gegenfilter_von ?? "").trim(),
        gegenfilter_bis: String(row?.gegenfilter_bis ?? "").trim(),
        tondichtung_von_2: String(row?.tondichtung_von_2 ?? "").trim(),
        tondichtung_bis_2: String(row?.tondichtung_bis_2 ?? "").trim(),
        zement_bent_von: String(row?.zement_bent_von ?? "").trim(),
        zement_bent_bis: String(row?.zement_bent_bis ?? "").trim(),
        bohrgut_von: String(row?.bohrgut_von ?? "").trim(),
        bohrgut_bis: String(row?.bohrgut_bis ?? "").trim(),
      }))
      .filter((row: any) =>
        Object.values(row).some((val) => String(val ?? "").trim() !== "")
      );
    return normalized.slice(0, 4);
  };

  const probeTotals = { GP: 0, KP: 0, SP: 0, SPT: 0 };
  const addProbeTotal = (probeArtRaw: unknown) => {
    const art = normalizeProbeArt(String(probeArtRaw ?? "GP"));
    const bucket = getProbeCounterBucket(art);
    probeTotals[bucket as keyof typeof probeTotals] += 1;
  };
  const getSptEntries = (row: any) => {
    const explicit = Array.isArray(row?.spt_eintraege)
      ? row.spt_eintraege
          .map((entry: any) => ({
            von_m: String(entry?.von_m ?? "").trim(),
            bis_m: String(entry?.bis_m ?? "").trim(),
            schlag_1: String(entry?.schlag_1 ?? "").trim(),
            schlag_2: String(entry?.schlag_2 ?? "").trim(),
            schlag_3: String(entry?.schlag_3 ?? "").trim(),
          }))
          .slice(0, 6)
      : [];
    if (explicit.length > 0) return explicit;
    if (!row?.spt_gemacht) return [];
    return [
      {
        von_m: "",
        bis_m: "",
        schlag_1: String(row?.spt_schlag_1 ?? "").trim(),
        schlag_2: String(row?.spt_schlag_2 ?? "").trim(),
        schlag_3: String(row?.spt_schlag_3 ?? "").trim(),
      },
    ];
  };
  const buildFeststellungenWithSpt = (row: any, startIndex = 1) => {
    const baseText = String(row?.feststellungen ?? "").trim();
    const sptEntries = getSptEntries(row);
    if (sptEntries.length === 0) {
      return { text: baseText, count: 0 };
    }
    const sptLines = sptEntries
      .map((entry: { von_m?: string; bis_m?: string; schlag_1: string; schlag_2: string; schlag_3: string }, idx: number) => {
        const values = [entry.schlag_1, entry.schlag_2, entry.schlag_3].filter(Boolean);
        const range = entry.von_m || entry.bis_m ? ` von ${entry.von_m ?? ""} bis ${entry.bis_m ?? ""} m` : "";
        const header = `SPT ${startIndex + idx}${range}`.trim();
        if (!values.length) return header;
        return `${header}\n${values.join(" / ")}`;
      })
      .join("\n");
    return {
      text: baseText ? `${baseText}\n\n${sptLines}` : sptLines,
      count: sptEntries.length,
    };
  };

  if (Array.isArray(data?.schicht_rows) && data.schicht_rows.length > 0) {
    data.schicht_rows.forEach((row: any) => {
      const depthList = Array.isArray(row?.proben_tiefen)
        ? row.proben_tiefen.filter((v: any) => String(v ?? "").trim() !== "").slice(0, 10)
        : [];
      const sourceTypes = Array.isArray(row?.proben_arten) ? row.proben_arten : [];
      const sptEntries = getSptEntries(row);
      probeTotals.SPT += sptEntries.length;

      if (depthList.length > 0) {
        depthList.forEach((_: any, i: number) => {
          addProbeTotal(sourceTypes[i] ?? row?.proben_art ?? "GP");
        });
        return;
      }

      if (String(row?.proben_tiefe ?? "").trim()) {
        addProbeTotal(row?.proben_art ?? "GP");
      }
    });
  } else if (String(data?.proben_tiefe ?? "").trim()) {
    addProbeTotal(data?.proben_art ?? "GP");
  }

  // Datenfelder anhand Mapping platzieren
  SV_FIELDS.forEach((field) => {
    if (HIDDEN_FIELD_KEYS.has(field.key)) return;
    if (hasRowData && skipKeys.has(field.key)) return;
    const pageIndex = Math.max(0, Math.min(pages.length - 1, field.page - 1));
    let value =
      data?.[field.key] ??
      field.aliases?.map((k) => data?.[k]).find((v) => v != null);
    if (field.key === "probe_gp") value = probeTotals.GP > 0 ? String(probeTotals.GP) : "";
    if (field.key === "probe_kp") value = probeTotals.KP > 0 ? String(probeTotals.KP) : "";
    if (field.key === "probe_sp") value = probeTotals.SP > 0 ? String(probeTotals.SP) : "";
    if (field.key === "probe_spt") value = probeTotals.SPT > 0 ? String(probeTotals.SPT) : "";
    if (field.key === "probe_wp") value = "";
    if (field.key === "probe_bkb") value = "";
    if (FILTER_MULTI_KEYS.has(field.key)) return;
    if (MARKER_HIGHLIGHT_KEYS.has(field.key)) return;
    const text = value == null ? "" : String(value);
    if (!text) return;
    const x = field.x + (pageIndex === 0 ? getPage1FieldOffset(field.key, "x") : 0);
    const y = field.y + (pageIndex === 0 ? getPage1FieldOffset(field.key, "y") : 0);
    drawText(pageIndex, text, x, y, field.size ?? 10);
  });

  // Marker-style highlighting instead of "x" for selected checkboxes.
  if (String(data?.passavant ?? "").trim()) {
    drawHighlight(0, 467, 590, 40, 8);
  }
  if (String(data?.seba ?? "").trim()) {
    drawHighlight(0, 512, 590, 28, 8);
  }
  if (String(data?.betonsockel ?? "").trim()) {
    drawHighlight(0, 507, 572, 40, 8);
  }

  const filterRows = buildFilterRows().slice(0, 2);
  if (filterRows.length > 0) {
    FILTER_MULTI_KEYS.forEach((fieldKey) => {
      const field = fieldMap.get(fieldKey);
      if (!field) return;
      const pageIndex = Math.max(0, Math.min(pages.length - 1, field.page - 1));
      const baseX = field.x + (pageIndex === 0 ? getPage1FieldOffset(field.key, "x") : 0);
      const baseY = field.y + (pageIndex === 0 ? getPage1FieldOffset(field.key, "y") : 0);
      const values: string[] = filterRows
        .map((row: any) => String(row?.[fieldKey] ?? "").trim())
        .filter((value: string): value is string => value.length > 0);
      if (!values.length) return;

      if (values.length === 1) {
        // Single value: keep original look/position.
        drawText(pageIndex, values[0], baseX, baseY, field.size ?? 10);
        return;
      }

      // Multi-line values: draw smaller and slightly higher to avoid bottom overlap.
      const multiSize = 6.5;
      const lineGap = 6;
      const tondichtungAdjustment =
        fieldKey === "tondichtung_von" ||
        fieldKey === "tondichtung_bis" ||
        fieldKey === "tondichtung_von_2" ||
        fieldKey === "tondichtung_bis_2"
          ? -2
          : 0;
      const multiStartY = baseY + 7 + tondichtungAdjustment;
      values.forEach((text, idx) => {
        drawText(pageIndex, text, baseX, multiStartY - idx * lineGap, multiSize);
      });
    });
  }

  if (hasRowData) {
    const rowHeight = Number(data?.schicht_row_height) || 95;
    const startOffsetPage1 = Number(data?.schicht_start_offset_page_1) || 0;
    const startOffsetPage2 = Number(data?.schicht_start_offset_page_2) || 0;
    const xOffsetPage1 = Number(data?.schicht_x_offset_page_1) || 0;
    const xOffsetPage2 = Number(data?.schicht_x_offset_page_2) || 0;
    const rowOffsetsPage2 = Array.isArray(data?.schicht_row_offsets_page_2)
      ? (data.schicht_row_offsets_page_2 as Array<number | string>)
      : [];
    const xOffsetsPage1 =
      (data?.schicht_x_offsets_page_1 as Record<string, number>) ||
      (data?.schicht_x_offsets as Record<string, number>) ||
      {};
    const xOffsetsPage2 =
      (data?.schicht_x_offsets_page_2 as Record<string, number>) ||
      (data?.schicht_x_offsets as Record<string, number>) ||
      {};
    const rowFields = {
      a1: "schicht_a1",
      a2: "schicht_a2",
      b: "schicht_b",
      c: "schicht_c",
      d: "schicht_d",
      e: "schicht_e",
      f: "schicht_f",
      g: "schicht_g",
      h: "schicht_h",
      feststellungen: "feststellungen",
      proben_art: "proben_art",
      proben_nr: "proben_nr",
      proben_tiefe: "proben_tiefe",
    } as const;

    const festField = fieldMap.get("feststellungen");
    const probenArtField = fieldMap.get("proben_art");
    const getXOffset = (key: string, pageIndex: number) => {
      const source = pageIndex === 0 ? xOffsetsPage1 : xOffsetsPage2;
      return Number(source?.[key]) || 0;
    };
    const getGroupedSchichtXOffset = (key: string, pageIndex: number) => {
      if (pageIndex !== 0) return getXOffset(key, pageIndex);
      if (key === "a2" || key === "b" || key === "f") return getXOffset("a1", pageIndex);
      if (key === "g") return getXOffset("c", pageIndex);
      if (key === "h") return getXOffset("d", pageIndex);
      return getXOffset(key, pageIndex);
    };
    const getAlignedSchichtFieldKey = (fieldKey: string) => {
      if (fieldKey === "schicht_a2" || fieldKey === "schicht_b" || fieldKey === "schicht_f") {
        return "schicht_a1";
      }
      if (fieldKey === "schicht_g") return "schicht_c";
      if (fieldKey === "schicht_h") return "schicht_d";
      return fieldKey;
    };
    const getAlignedSchichtExtraX = (fieldKey: string) => {
      if (fieldKey === "schicht_c" || fieldKey === "schicht_g") return 4;
      if (fieldKey === "schicht_d" || fieldKey === "schicht_h") return 10;
      if (fieldKey === "schicht_e") return 12;
      return 0;
    };
    const ansatzField = fieldMap.get("schicht_ansatzpunkt_bis");
    const probenNrField = fieldMap.get("proben_nr");
    const probeCounters: Record<string, number> = {};

    let sptRunningNumber = 1;
    data.schicht_rows.forEach((row: any, idx: number) => {
      const pageIndex =
        idx < rowsPerPagePage1
          ? 0
          : 1 + Math.floor((idx - rowsPerPagePage1) / rowsPerPagePageN);
      if (pageIndex >= pages.length) return;
      const localIdx =
        idx < rowsPerPagePage1
          ? idx
          : (idx - rowsPerPagePage1) % rowsPerPagePageN;
      const yOffset =
        localIdx * rowHeight +
        (pageIndex >= 1 ? Number(rowOffsetsPage2[localIdx]) || 0 : 0);
      const pageStartOffset = pageIndex === 0 ? startOffsetPage1 : startOffsetPage2;
      const pageXOffset = pageIndex === 0 ? xOffsetPage1 : xOffsetPage2;
      if (ansatzField) {
        const value = row?.ansatzpunkt_bis;
        const text = value == null ? "" : String(value);
        if (text) {
          drawText(
            pageIndex,
            text,
            ansatzField.x +
              pageXOffset +
              getXOffset("ansatzpunkt_bis", pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "x") +
                  getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "x")
                : 0),
            ansatzField.y +
              pageStartOffset -
              yOffset +
              (pageIndex === 0
                ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "y") +
                  getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "y")
                : 0),
            ansatzField.size ?? 10
          );
        }
      }
      const depthList = Array.isArray(row?.proben_tiefen)
        ? row.proben_tiefen.filter((v: any) => String(v ?? "").trim() !== "").slice(0, 10)
        : [];
      const hasDepthList = depthList.length > 0;
      Object.entries(rowFields).forEach(([rowKey, fieldKey]) => {
        const field = fieldMap.get(fieldKey);
        if (!field) return;
        const alignedFieldKey = pageIndex === 0 ? getAlignedSchichtFieldKey(fieldKey) : fieldKey;
        const alignedField = pageIndex === 0 ? fieldMap.get(alignedFieldKey) ?? field : field;
        if (hasDepthList && (fieldKey === "proben_art" || fieldKey === "proben_nr")) return;
        const value = row?.[rowKey];
        const festWithSpt =
          fieldKey === "feststellungen"
            ? buildFeststellungenWithSpt(row, sptRunningNumber)
            : null;
        const text =
          fieldKey === "feststellungen"
            ? festWithSpt?.text ?? ""
            : value == null
              ? ""
              : String(value);
        if (fieldKey === "feststellungen") {
          sptRunningNumber += festWithSpt?.count ?? 0;
        }
        if (!text) return;
        if (fieldKey === "feststellungen" && festField && probenArtField) {
          const festX =
            festField.x +
            pageXOffset +
            getXOffset("feststellungen", pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset("feststellungen", "x") +
                getRowFieldOffsetPage1(localIdx, "feststellungen", "x")
              : 0);
          const probenX =
            probenArtField.x +
            pageXOffset +
            getXOffset("proben_art", pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset("proben_art", "x") +
                getRowFieldOffsetPage1(localIdx, "proben_art", "x")
              : 0);
          const maxWidth = Math.max(40, probenX - festX - 6);
          const maxHeight = Math.max(40, Math.min(rowHeight - 8, 160));
          const festSize = Math.max(7, (field.size ?? 10) - 2);
          drawWrappedText(
            pageIndex,
            text,
            festX,
            festField.y +
              pageStartOffset -
              yOffset - 4 +
              (pageIndex === 0
                ? getPage1FieldOffset("feststellungen", "y") +
                  getRowFieldOffsetPage1(localIdx, "feststellungen", "y")
                : 0),
            maxWidth,
            maxHeight,
            festSize,
            9
          );
          return;
        }
        if (fieldKey === "proben_tiefe" && field?.width) {
          if (depthList.length) {
            const x =
              alignedField.x +
              pageXOffset +
              getGroupedSchichtXOffset(rowKey as keyof typeof rowFields, pageIndex) +
              getAlignedSchichtExtraX(fieldKey) +
              (pageIndex === 0
                ? getPage1FieldOffset(alignedFieldKey, "x") +
                  getRowFieldOffsetPage1X(localIdx, fieldKey)
                : 0);
            const yTop =
              field.y +
              pageStartOffset -
              yOffset +
              (pageIndex === 0
                ? getPage1FieldOffset(fieldKey, "y") +
                  getRowFieldOffsetPage1(localIdx, fieldKey, "y")
                : 0);
            const maxWidth = Math.max(20, field.width);
            const maxHeight = Math.max(20, rowHeight - 10);
            const fixedSize = Math.max(7, (field.size ?? 6) + 1);
            const lineHeight = Math.max(8, Math.round(fixedSize * 1.2));
            const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
            const sourceTypes = Array.isArray(row?.proben_arten) ? row.proben_arten : [];
            const nrX =
              (probenNrField?.x ?? 0) +
              pageXOffset +
              getXOffset("proben_nr", pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset("proben_nr", "x") +
                  getRowFieldOffsetPage1(localIdx, "proben_nr", "x")
                : 0);
            const artX =
              (probenArtField?.x ?? 0) +
              pageXOffset +
              getXOffset("proben_art", pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset("proben_art", "x") +
                  getRowFieldOffsetPage1(localIdx, "proben_art", "x")
                : 0);
            depthList.slice(0, maxLines).forEach((val: any, i: number) => {
              const textLine = wrapText(String(val), maxWidth, fixedSize)[0] ?? "";
              const lineY = yTop - i * lineHeight;
              drawText(pageIndex, textLine, x, lineY, fixedSize);
              const rawType = String(sourceTypes[i] ?? row?.proben_art ?? "").trim();
              const artText = rawType ? normalizeProbeArt(rawType) : "";
              if (artText && probenArtField) {
                drawText(pageIndex, artText, artX, lineY, fixedSize);
              }
              if (probenNrField && artText) {
                const counterBucket = getProbeCounterBucket(artText);
                const nextNr = (probeCounters[counterBucket] ?? 0) + 1;
                probeCounters[counterBucket] = nextNr;
                drawText(pageIndex, String(nextNr), nrX, lineY, fixedSize);
              }
            });
            return;
          }
          const x =
            alignedField.x +
            pageXOffset +
            getGroupedSchichtXOffset(rowKey as keyof typeof rowFields, pageIndex) +
            getAlignedSchichtExtraX(fieldKey) +
            (pageIndex === 0
              ? getPage1FieldOffset(alignedFieldKey, "x") +
                getRowFieldOffsetPage1X(localIdx, fieldKey)
              : 0);
          const yTop =
            field.y +
            pageStartOffset -
            yOffset +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "y") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "y")
              : 0);
          const maxWidth = Math.max(20, field.width);
          const maxHeight = Math.max(20, rowHeight - 10);
          const baseSize = field.size ?? 6;
          const fitSizes = [baseSize, Math.max(4, baseSize - 1), Math.max(4, baseSize - 2)];
          const lineHeightFor = (s: number) => Math.max(10, Math.round(s * 1.25));
          const maxLinesFor = (s: number) => Math.max(1, Math.floor(maxHeight / lineHeightFor(s)));
          const linesFor = (s: number) => {
            const paragraphs = text.split("\n");
            const lines: string[] = [];
            paragraphs.forEach((para: string) => {
              if (!para.trim()) {
                lines.push("");
                return;
              }
              wrapText(para, maxWidth, s).forEach((ln) => lines.push(ln));
            });
            return lines;
          };
          let chosenSize = baseSize;
          for (const s of fitSizes) {
            if (linesFor(s).length <= maxLinesFor(s)) {
              chosenSize = s;
              break;
            }
          }
          drawWrappedText(pageIndex, text, x, yTop, maxWidth, maxHeight, chosenSize);
          return;
        }
        drawText(
          pageIndex,
          text,
          alignedField.x +
            pageXOffset +
            getGroupedSchichtXOffset(rowKey as keyof typeof rowFields, pageIndex) +
            getAlignedSchichtExtraX(fieldKey) +
            (pageIndex === 0
              ? getPage1FieldOffset(alignedFieldKey, "x") +
                getRowFieldOffsetPage1X(localIdx, fieldKey)
              : 0),
          field.y +
            pageStartOffset -
            yOffset +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "y") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "y")
              : 0),
          field.size ?? 10
        );
      });
    });
  }

  const groundwaterRows = Array.isArray(data?.grundwasser_rows)
    ? data.grundwasser_rows
    : [];
  if (groundwaterRows.length) {
    const gwFields = {
      grundwasserstand: "grundwasserstand",
      datum: "datum",
      uhrzeit: "uhrzeit",
      tiefe_m: "tiefe_m",
      uk_verrohrg: "uk_verrohrg",
      bohrtiefe: "bohrtiefe",
    } as const;
    const gwRowH = Number(data?.grundwasser_row_height) || 16;

    groundwaterRows.slice(0, 4).forEach((row: any, idx: number) => {
      Object.entries(gwFields).forEach(([rowKey, fieldKey]) => {
        const field = fieldMap.get(fieldKey);
        if (!field) return;
        const value = row?.[rowKey];
        const text = value == null ? "" : String(value);
        if (!text) return;
        drawText(
          field.page - 1,
          text,
          field.x + (field.page === 1 ? getPage1FieldOffset(field.key, "x") : 0),
          field.y - idx * gwRowH + 2 + (field.page === 1 ? getPage1FieldOffset(field.key, "y") : 0),
          field.size ?? 9
        );
      });
    });
  }

  return outDoc.save();
}
