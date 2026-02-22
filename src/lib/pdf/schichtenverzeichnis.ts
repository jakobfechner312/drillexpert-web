import { PDFDocument, StandardFonts, popGraphicsState, pushGraphicsState, rgb, setCharacterSqueeze } from "pdf-lib";
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
const TEMPLATE_PAGE_GW = "GW_SV.pdf" as const;
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
  const groundwaterRows = Array.isArray(data?.grundwasser_rows)
    ? data.grundwasser_rows
    : [];
  const gwRowsPerPage = Math.max(1, Number(data?.grundwasser_rows_per_sheet) || 32);
  const gwOverflowRows = groundwaterRows.length > 4 ? groundwaterRows.slice(4) : [];
  const requiredGwCopies = gwOverflowRows.length > 0
    ? Math.ceil(gwOverflowRows.length / gwRowsPerPage)
    : 0;

  const inputSchichtRows = Array.isArray(data?.schicht_rows) ? data.schicht_rows : [];
  const probeTiefeFieldForSplit = SV_FIELDS.find((field) => field.key === "proben_tiefe");
  const rowHeightForSplit = Number(data?.schicht_row_height) || 95;
  const probeFixedSizeForSplit = Math.max(7, (probeTiefeFieldForSplit?.size ?? 6) + 1);
  const probeLineHeightForSplit = Math.max(8, Math.round(probeFixedSizeForSplit * 1.2));
  const probeMaxPerTableRow = Math.max(
    1,
    Math.floor(Math.max(20, rowHeightForSplit - 10) / probeLineHeightForSplit)
  );
  const sptMaxPerTableRow = 2;
  const normalizeProbeArtForSplit = (value: unknown) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (normalized === "EP") return "EP";
    if (normalized === "UP") return "UP";
    if (normalized === "BG") return "BG";
    return "GP";
  };
  function parseDepthNumeric(value: unknown): number | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (/[a-zA-Z]/.test(raw)) return null;
    const normalized = raw.replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function formatDepthNumeric(value: number): string {
    const fixed = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
    return fixed.replace(".", ",");
  }
  function computeSptBisFromEntry(entry: { von_m?: string; schlag_1?: string; schlag_2?: string; schlag_3?: string }) {
    const fromValue = parseDepthNumeric(entry?.von_m);
    if (fromValue == null) return "";
    const filledSegments = [entry?.schlag_1, entry?.schlag_2, entry?.schlag_3].filter(
      (value) => String(value ?? "").trim() !== ""
    ).length;
    return formatDepthNumeric(fromValue + filledSegments * 0.15);
  }
  const expandedSchichtRows = inputSchichtRows;
  const normalizedProbeRows = Array.isArray(data?.proben_rows) && data.proben_rows.length > 0
    ? data.proben_rows
        .map((row: any) => ({
          art: normalizeProbeArtForSplit(row?.art),
          tiefe: String(row?.tiefe ?? "").trim(),
        }))
        .filter((row: { art: string; tiefe: string }) => row.tiefe !== "")
    : inputSchichtRows.flatMap((row: any) => {
        const depthList = Array.isArray(row?.proben_tiefen)
          ? row.proben_tiefen.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : [];
        if (depthList.length > 0) {
          const sourceTypes = Array.isArray(row?.proben_arten) ? row.proben_arten : [];
          return depthList.map((tiefe: string, idx: number) => ({
            art: normalizeProbeArtForSplit(sourceTypes[idx] ?? row?.proben_art),
            tiefe,
          }));
        }
        const tiefe = String(row?.proben_tiefe ?? "").trim();
        if (!tiefe) return [];
        return [
          {
            art: normalizeProbeArtForSplit(row?.proben_art),
            tiefe,
          },
        ];
      });
  const normalizedSptRows = Array.isArray(data?.spt_rows) && data.spt_rows.length > 0
    ? data.spt_rows
        .map((row: any) => ({
          von_m: String(row?.von_m ?? "").trim(),
          bis_m: String(row?.bis_m ?? "").trim(),
          schlag_1: String(row?.schlag_1 ?? "").trim(),
          schlag_2: String(row?.schlag_2 ?? "").trim(),
          schlag_3: String(row?.schlag_3 ?? "").trim(),
        }))
        .filter((row: { von_m: string; bis_m: string }) => row.von_m !== "" || row.bis_m !== "")
        .slice(0, 10)
    : inputSchichtRows.flatMap((row: any) => {
        const entries = Array.isArray(row?.spt_eintraege) ? row.spt_eintraege : [];
        return entries
          .map((entry: any) => ({
            von_m: String(entry?.von_m ?? "").trim(),
            bis_m: String(computeSptBisFromEntry(entry) || (entry?.bis_m ?? "")).trim(),
            schlag_1: String(entry?.schlag_1 ?? "").trim(),
            schlag_2: String(entry?.schlag_2 ?? "").trim(),
            schlag_3: String(entry?.schlag_3 ?? "").trim(),
          }))
          .filter((entry: { von_m: string; bis_m: string }) => entry.von_m !== "" || entry.bis_m !== "");
      }).slice(0, 10);

  const hasRowData = expandedSchichtRows.length > 0;
  const fallbackRowsPerPage = Math.max(1, Number(data?.schicht_rows_per_page) || 4);
  // Keep page capacities aligned with the calibrated templates.
  // If saved tuning values are too large, overflow rows would never paginate to extra sheets.
  const maxRowsPage1 = 4;
  const maxRowsPageN = 8;
  const rowsPerPagePage1 = Math.max(
    1,
    Math.min(maxRowsPage1, Number(data?.schicht_rows_per_page_1) || fallbackRowsPerPage)
  );
  const rowsPerPagePageN = Math.max(
    1,
    Math.min(maxRowsPageN, Number(data?.schicht_rows_per_page_2) || fallbackRowsPerPage)
  );
  const probeRowsNeeded =
    normalizedProbeRows.length > 0
      ? Math.ceil(normalizedProbeRows.length / probeMaxPerTableRow)
      : 0;
  const sptRowsNeeded =
    normalizedSptRows.length > 0
      ? Math.ceil(normalizedSptRows.length / sptMaxPerTableRow)
      : 0;
  const rowCount = Math.max(hasRowData ? expandedSchichtRows.length : 0, probeRowsNeeded, sptRowsNeeded);
  const remainingAfterPage1 = Math.max(0, rowCount - rowsPerPagePage1);
  const requiredPageNCopies = hasRowData
    ? Math.ceil(remainingAfterPage1 / rowsPerPagePageN)
    : 0;

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

  if (requiredPageNCopies > 0) {
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
  }
  const gwPageStartIndex = pages.length;
  if (requiredGwCopies > 0) {
    const gwTemplatePath = getTemplatePath(TEMPLATE_PAGE_GW);
    if (!fs.existsSync(gwTemplatePath)) {
      throw new Error(`Template PDF not found at: ${gwTemplatePath}`);
    }
    const gwTemplateBytes = fs.readFileSync(gwTemplatePath);
    const gwSrcDoc = await PDFDocument.load(gwTemplateBytes);
    for (let i = 0; i < requiredGwCopies; i += 1) {
      const [gwPage] = await outDoc.copyPages(gwSrcDoc, [0]);
      outDoc.addPage(gwPage);
      pages.push(gwPage);
    }
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
  const drawTextCondensed = (
    pageIndex: number,
    text: string,
    x: number,
    y: number,
    size = 10,
    squeezePercent = 92
  ) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeezePercent));
    page.drawText(text ?? "", { x, y, size, font, color: rgb(0, 0.35, 0.9) });
    page.pushOperators(setCharacterSqueeze(100), popGraphicsState());
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
  const drawCircleMarker = (pageIndex: number, x: number, y: number, radius = 5.2) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawCircle({
      x,
      y,
      size: radius,
      borderWidth: 1.2,
      borderColor: rgb(0, 0.35, 0.9),
    });
  };
  const buildBohrungen = () => {
    const normalizeType = (value: unknown) => {
      const raw = String(value ?? "").trim().toLowerCase();
      if (raw === "greif") return "greif";
      if (raw === "rotation") return "rotation";
      if (raw === "ek_dks") return "ek_dks";
      if (raw === "voll") return "voll";
      return "ramm";
    };
    const parseDiameter = (value: string) => {
      const raw = String(value ?? "").trim();
      const normalizedRaw = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(",", ".");
      const cleaned = normalizedRaw.replace(/[^\d.]/g, "");
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
      greif: "Greiferbohrung",
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
  const fitTextToTwoLines = (text: string, maxWidth: number, preferredSize: number, minSize = 7) => {
    for (let size = preferredSize; size >= minSize; size -= 0.5) {
      const lines = wrapText(text, maxWidth, size);
      if (lines.length <= 2) return { size, lines };
    }
    const size = minSize;
    const rawLines = wrapText(text, maxWidth, size);
    if (rawLines.length <= 2) return { size, lines: rawLines };
    const firstLine = rawLines[0];
    let secondLine = rawLines.slice(1).join(" ");
    while (secondLine.length > 0 && font.widthOfTextAtSize(`${secondLine}...`, size) > maxWidth) {
      secondLine = secondLine.slice(0, -1);
    }
    return { size, lines: [firstLine, `${secondLine}...`] };
  };
  const normalizeProbeArt = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (normalized === "EP") return "EP";
    if (normalized === "UP") return "UP";
    if (normalized === "BG") return "BG";
    return "GP";
  };
  const getProbeCounterBucket = (probeArt: string) => {
    if (probeArt === "EP") return "KP";
    if (probeArt === "UP") return "SP";
    if (probeArt === "BG") return "BG";
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
    "probe_bg",
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
  const getRowFieldOffsetPage1Y = (rowIndex: number, fieldKey: string) => {
    const base = getRowFieldOffsetPage1(rowIndex, fieldKey, "y");
    if (rowIndex === 0 && fieldKey === "schicht_a2") {
      return base + 3;
    }
    if (rowIndex === 3) {
      const gAlignedY = getRowFieldOffsetPage1(rowIndex, "schicht_g", "y") - 5;
      if (
        fieldKey === "schicht_e" ||
        fieldKey === "schicht_f" ||
        fieldKey === "schicht_g" ||
        fieldKey === "schicht_h"
      ) {
        return gAlignedY;
      }
      const dAlignedY = getRowFieldOffsetPage1(rowIndex, "schicht_d", "y") - 3;
      if (fieldKey === "schicht_d" || fieldKey === "schicht_b" || fieldKey === "schicht_c") {
        return dAlignedY;
      }
      return base;
    }
    if (rowIndex === 2 && (fieldKey === "schicht_b" || fieldKey === "schicht_c")) {
      return getRowFieldOffsetPage1(rowIndex, "schicht_d", "y");
    }
    if (rowIndex === 1 && (fieldKey === "schicht_b" || fieldKey === "schicht_c")) {
      return getRowFieldOffsetPage1(rowIndex, "schicht_d", "y");
    }
    return base;
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

  const probeTotals = { GP: 0, KP: 0, SP: 0, BG: 0, SPT: 0 };
  const addProbeTotal = (probeArtRaw: unknown) => {
    const art = normalizeProbeArt(String(probeArtRaw ?? "GP"));
    const bucket = getProbeCounterBucket(art);
    probeTotals[bucket as keyof typeof probeTotals] += 1;
  };

  probeTotals.SPT += normalizedSptRows.length;
  if (normalizedProbeRows.length > 0) {
    normalizedProbeRows.forEach((row: { art: string }) => addProbeTotal(row.art));
  } else if (String(data?.proben_tiefe ?? "").trim()) {
    addProbeTotal(data?.proben_art ?? "GP");
  }

  // Datenfelder anhand Mapping platzieren
  const FIXED_PAGE1_PROBE_BG_X = 525;
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
    if (field.key === "probe_bg") value = probeTotals.BG > 0 ? String(probeTotals.BG) : "";
    if (field.key === "probe_spt") value = probeTotals.SPT > 0 ? String(probeTotals.SPT) : "";
    if (field.key === "probe_wp") value = "";
    if (field.key === "probe_bkb") value = "";
    if (FILTER_MULTI_KEYS.has(field.key)) return;
    if (MARKER_HIGHLIGHT_KEYS.has(field.key)) return;
    const text = value == null ? "" : String(value);
    if (!text) return;
    const x =
      field.key === "probe_bg" && pageIndex === 0
        ? FIXED_PAGE1_PROBE_BG_X
        : field.x + (pageIndex === 0 ? getPage1FieldOffset(field.key, "x") : 0);
    const y = field.y + (pageIndex === 0 ? getPage1FieldOffset(field.key, "y") : 0);
    if (field.key === "kies_koernung") {
      const maxWidth = 50;
      const baseSize = field.size ?? 10;
      if (font.widthOfTextAtSize(text, baseSize) <= maxWidth) {
        drawText(pageIndex, text, x, y, baseSize);
        return;
      }
      const fitted = fitTextToTwoLines(text, maxWidth, baseSize, 7);
      const lineHeight = Math.max(7, Math.round(fitted.size * 1.15));
      const startY = y + (fitted.lines.length > 1 ? 5 : 2);
      fitted.lines.forEach((line, idx) => {
        drawText(pageIndex, line, x, startY - idx * lineHeight, fitted.size);
      });
      return;
    }
    if (field.key === "rok") {
      const maxWidth = 40;
      const baseSize = field.size ?? 9;
      if (font.widthOfTextAtSize(text, baseSize) <= maxWidth) {
        drawText(pageIndex, text, x, y, baseSize);
        return;
      }
      const fitted = fitTextToTwoLines(text, maxWidth, baseSize, 6.5);
      const lineHeight = Math.max(7, Math.round(fitted.size * 1.15));
      const startY = y + (fitted.lines.length > 1 ? 5 : 2);
      fitted.lines.forEach((line, idx) => {
        drawText(pageIndex, line, x, startY - idx * lineHeight, fitted.size);
      });
      return;
    }
    drawText(pageIndex, text, x, y, field.size ?? 10);
  });
  const probeBgField = fieldMap.get("probe_bg");
  if (probeBgField) {
    const pageIndex = Math.max(0, Math.min(pages.length - 1, probeBgField.page - 1));
    const x =
      pageIndex === 0
        ? FIXED_PAGE1_PROBE_BG_X + 15
        : probeBgField.x + 15 + getPage1FieldOffset("probe_bg", "x");
    const y = probeBgField.y + (pageIndex === 0 ? getPage1FieldOffset("probe_bg", "y") : 0);
    drawStaticText(pageIndex, "BG", x, y, 10);
  }
  // Circle marker for Ki/m (l/v): circle "L" for liefern or "V" for vorhalten.
  // Coordinates are aligned to the probe counters row, per user calibration.
  const deliverKernkisten = String(data?.kernkisten_liefern ?? "").trim() !== "";
  const holdKernkisten = String(data?.kernkisten_vorhalten ?? "").trim() !== "";
  if (deliverKernkisten || holdKernkisten) {
    const probeGpField = fieldMap.get("probe_gp");
    if (probeGpField) {
      const yBase =
        probeGpField.y + (probeGpField.page === 1 ? getPage1FieldOffset("probe_gp", "y") : 0);
      // Slight +3 shifts from text baseline to visual center of the letter.
      const markerY = yBase + 3;
      if (deliverKernkisten) {
        drawCircleMarker(0, 393, markerY);
      } else if (holdKernkisten) {
        drawCircleMarker(0, 400, markerY);
      }
    }
  }

  // Marker-style highlighting instead of "x" for selected checkboxes.
  if (String(data?.passavant ?? "").trim()) {
    drawHighlight(0, 467, 590, 40, 8);
  }
  if (String(data?.seba ?? "").trim()) {
    drawHighlight(0, 512, 590, 28, 8);
  }
  if (String(data?.kompaktkappe ?? "").trim()) {
    drawHighlight(0, 540, 590, 62, 8);
  }
  if (String(data?.betonsockel ?? "").trim()) {
    drawHighlight(0, 507, 572, 40, 8);
  }
  drawStaticText(0, "/ Kompakt.", 540, 590, 9);

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

  if (hasRowData || normalizedProbeRows.length > 0) {
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
    const getAlignedSchichtExtraX = (fieldKey: string, pageIndex: number) => {
      if (fieldKey === "schicht_c" || fieldKey === "schicht_g") return 4 + (pageIndex === 0 ? 5 : 0);
      if (fieldKey === "schicht_d" || fieldKey === "schicht_h") return 10 + (pageIndex >= 1 ? -8 : 0);
      if (fieldKey === "schicht_e") return 12;
      return 0;
    };
    const ansatzField = fieldMap.get("schicht_ansatzpunkt_bis");
    const probenTiefeField = fieldMap.get("proben_tiefe");
    const probenNrField = fieldMap.get("proben_nr");
    const lastSchichtRowIndex = (() => {
      let lastFilled = -1;
      expandedSchichtRows.forEach((row: any, rowIdx: number) => {
        const hasContent = Object.values(row ?? {}).some((value) => {
          if (Array.isArray(value)) return value.some((entry) => String(entry ?? "").trim() !== "");
          return String(value ?? "").trim() !== "";
        });
        if (hasContent) lastFilled = rowIdx;
      });
      return lastFilled >= 0 ? lastFilled : Math.max(0, expandedSchichtRows.length - 1);
    })();

    expandedSchichtRows.forEach((row: any, idx: number) => {
      const pageIndex =
        idx < rowsPerPagePage1
          ? 0
          : 1 + Math.floor((idx - rowsPerPagePage1) / rowsPerPagePageN);
      if (pageIndex >= pages.length) return;
      const localIdx =
        idx < rowsPerPagePage1
          ? idx
          : (idx - rowsPerPagePage1) % rowsPerPagePageN;
      const isLastRowOnFirstSheet = pageIndex === 0 && localIdx === rowsPerPagePage1 - 1;
      const yOffset =
        localIdx * rowHeight +
        (pageIndex >= 1 ? Number(rowOffsetsPage2[localIdx]) || 0 : 0);
      const pageStartOffset = pageIndex === 0 ? startOffsetPage1 : startOffsetPage2;
      const pageXOffset = pageIndex === 0 ? xOffsetPage1 : xOffsetPage2;
      const smallFieldKeys = ["schicht_b", "schicht_c", "schicht_d"] as const;
      const rowSmallFieldSharedSize = (() => {
        const preferredSize = 10;
        const minSize = 6.5;
        const entries = smallFieldKeys
          .map((key) => {
            const sourceKey = key === "schicht_b" ? "b" : key === "schicht_c" ? "c" : "d";
            const value = row?.[sourceKey];
            const text = value == null ? "" : String(value).trim();
            const field = fieldMap.get(key);
            if (!text || !field) return null;
            const maxWidth = Math.max(28, (field.width ?? 60) - 6);
            return { text, maxWidth };
          })
          .filter((entry): entry is { text: string; maxWidth: number } => entry != null);
        if (entries.length === 0) return null;
        const needsWrap = entries.some(
          (entry) => font.widthOfTextAtSize(entry.text, preferredSize) > entry.maxWidth
        );
        if (!needsWrap) return null;
        for (let size = preferredSize; size >= minSize; size -= 0.5) {
          const fitsAll = entries.every((entry) => wrapText(entry.text, entry.maxWidth, size).length <= 2);
          if (fitsAll) return size;
        }
        return minSize;
      })();
      if (ansatzField) {
        const value = row?.ansatzpunkt_bis;
        const isLastSchichtRow = idx === lastSchichtRowIndex;
        const text = value == null ? "" : String(value);
        const drawX =
          ansatzField.x +
          pageXOffset +
          getXOffset("ansatzpunkt_bis", pageIndex) +
          (pageIndex === 0
            ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "x") +
              getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "x")
            : 0);
        const drawY =
          ansatzField.y +
          pageStartOffset -
          yOffset +
          (pageIndex === 0
            ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "y") +
              getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "y")
            : 0);
        if (text) {
          drawText(
            pageIndex,
            text,
            drawX,
            drawY,
            ansatzField.size ?? 10
          );
        }
        if (isLastSchichtRow) {
          // Keep depth text and add ET in the lower half of the same field.
          drawText(pageIndex, "ET", drawX, drawY - 40, (ansatzField.size ?? 10) + 3);
        }
      }
      Object.entries(rowFields).forEach(([rowKey, fieldKey]) => {
        const field = fieldMap.get(fieldKey);
        if (!field) return;
        const alignedFieldKey = pageIndex === 0 ? getAlignedSchichtFieldKey(fieldKey) : fieldKey;
        const alignedField = pageIndex === 0 ? fieldMap.get(alignedFieldKey) ?? field : field;
        const value = row?.[rowKey];
        const text =
          value == null
            ? ""
            : String(value);
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
        const row4Sheet1FieldLift =
          isLastRowOnFirstSheet &&
          (fieldKey === "schicht_e" || fieldKey === "schicht_f" || fieldKey === "schicht_g" || fieldKey === "schicht_h")
            ? 4
            : 0;
        const drawX =
          alignedField.x +
          pageXOffset +
          getGroupedSchichtXOffset(rowKey as keyof typeof rowFields, pageIndex) +
          getAlignedSchichtExtraX(fieldKey, pageIndex) +
          (pageIndex === 0
            ? getPage1FieldOffset(alignedFieldKey, "x") +
              getRowFieldOffsetPage1X(localIdx, fieldKey)
            : 0);
        const drawY =
          field.y +
          pageStartOffset -
          yOffset +
          row4Sheet1FieldLift +
          (pageIndex === 0
            ? getPage1FieldOffset(fieldKey, "y") +
              getRowFieldOffsetPage1Y(localIdx, fieldKey)
            : 0);
        const baseSize = field.size ?? 10;
        const shouldWrapInSmallField =
          fieldKey === "schicht_b" || fieldKey === "schicht_c" || fieldKey === "schicht_d";
        if (!shouldWrapInSmallField) {
          drawText(pageIndex, text, drawX, drawY, baseSize);
          return;
        }
        const maxWidth = Math.max(28, (field.width ?? 60) - 6);
        const effectiveSize = rowSmallFieldSharedSize ?? baseSize;
        if (font.widthOfTextAtSize(text, effectiveSize) <= maxWidth) {
          drawText(pageIndex, text, drawX, drawY, effectiveSize);
          return;
        }
        const fitted = fitTextToTwoLines(text, maxWidth, effectiveSize, effectiveSize);
        const lineHeight = Math.max(6, Math.round(fitted.size * 1.1));
        const multilineAnchorY = (() => {
          if (fitted.lines.length <= 1) return drawY;
          const dField = fieldMap.get("schicht_d");
          if (!dField) return drawY;
          return (
            dField.y +
            pageStartOffset -
            yOffset +
            (pageIndex === 0
              ? getPage1FieldOffset("schicht_d", "y") + getRowFieldOffsetPage1Y(localIdx, "schicht_d")
              : 0)
          );
        })();
        const multilineLift = fitted.lines.length > 1 ? 5 : 0;
        const startY = multilineAnchorY + Math.max(2, Math.round(fitted.size * 0.45)) + multilineLift;
        fitted.lines.forEach((line, lineIdx) => {
          drawText(pageIndex, line, drawX, startY - lineIdx * lineHeight, fitted.size);
        });
      });
    });

    if (normalizedProbeRows.length > 0 && probenTiefeField && probenArtField) {
      const probeCounters: Record<string, number> = {};
      normalizedProbeRows.forEach((probe: { art: string; tiefe: string }, idx: number) => {
        const tableRowIndex = Math.floor(idx / probeMaxPerTableRow);
        const lineInRow = idx % probeMaxPerTableRow;
        const pageIndex =
          tableRowIndex < rowsPerPagePage1
            ? 0
            : 1 + Math.floor((tableRowIndex - rowsPerPagePage1) / rowsPerPagePageN);
        if (pageIndex >= pages.length) return;
        const localIdx =
          tableRowIndex < rowsPerPagePage1
            ? tableRowIndex
            : (tableRowIndex - rowsPerPagePage1) % rowsPerPagePageN;
        const yOffset =
          localIdx * rowHeight +
          (pageIndex >= 1 ? Number(rowOffsetsPage2[localIdx]) || 0 : 0);
        const pageStartOffset = pageIndex === 0 ? startOffsetPage1 : startOffsetPage2;
        const pageXOffset = pageIndex === 0 ? xOffsetPage1 : xOffsetPage2;
        const fixedSize = Math.max(7, (probenTiefeField.size ?? 6) + 1);
        const baseY =
          probenTiefeField.y +
          pageStartOffset -
          yOffset +
          (pageIndex === 0
            ? getPage1FieldOffset("proben_tiefe", "y") +
              getRowFieldOffsetPage1(localIdx, "proben_tiefe", "y")
            : 0);
        const lineHeight = Math.max(8, Math.round(fixedSize * 1.2));
        const lineY = baseY - lineInRow * lineHeight;
        const tiefeText = String(probe.tiefe ?? "").trim();
        const tiefeX =
          probenTiefeField.x +
          pageXOffset +
          getXOffset("proben_tiefe", pageIndex) +
          (pageIndex === 0
            ? getPage1FieldOffset("proben_tiefe", "x") +
              getRowFieldOffsetPage1(localIdx, "proben_tiefe", "x")
            : 0);
        if (tiefeText.length >= 9) {
          drawTextCondensed(pageIndex, tiefeText, tiefeX, lineY, fixedSize, 90);
        } else {
          drawText(pageIndex, tiefeText, tiefeX, lineY, fixedSize);
        }

        const artText = normalizeProbeArt(probe.art || "GP");
        drawText(
          pageIndex,
          artText,
          probenArtField.x +
            pageXOffset +
            getXOffset("proben_art", pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset("proben_art", "x") +
                getRowFieldOffsetPage1(localIdx, "proben_art", "x")
              : 0),
          lineY,
          fixedSize
        );
        if (probenNrField) {
          const counterBucket = getProbeCounterBucket(artText);
          const nextNr = (probeCounters[counterBucket] ?? 0) + 1;
          probeCounters[counterBucket] = nextNr;
          drawText(
            pageIndex,
            String(nextNr),
            probenNrField.x +
              pageXOffset +
              getXOffset("proben_nr", pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset("proben_nr", "x") +
                  getRowFieldOffsetPage1(localIdx, "proben_nr", "x")
                : 0),
            lineY,
            fixedSize
          );
        }
      });
    }

    if (normalizedSptRows.length > 0 && festField) {
      normalizedSptRows.forEach(
        (
          entry: { von_m: string; bis_m: string; schlag_1?: string; schlag_2?: string; schlag_3?: string },
          idx: number
        ) => {
        const tableRowIndex = Math.floor(idx / sptMaxPerTableRow);
        const lineInRow = idx % sptMaxPerTableRow;
        const pageIndex =
          tableRowIndex < rowsPerPagePage1
            ? 0
            : 1 + Math.floor((tableRowIndex - rowsPerPagePage1) / rowsPerPagePageN);
        if (pageIndex >= pages.length) return;
        const localIdx =
          tableRowIndex < rowsPerPagePage1
            ? tableRowIndex
            : (tableRowIndex - rowsPerPagePage1) % rowsPerPagePageN;
        const yOffset =
          localIdx * rowHeight +
          (pageIndex >= 1 ? Number(rowOffsetsPage2[localIdx]) || 0 : 0);
        const pageStartOffset = pageIndex === 0 ? startOffsetPage1 : startOffsetPage2;
        const pageXOffset = pageIndex === 0 ? xOffsetPage1 : xOffsetPage2;
        const festX =
          festField.x +
          pageXOffset +
          getXOffset("feststellungen", pageIndex) +
          (pageIndex === 0
            ? getPage1FieldOffset("feststellungen", "x") +
              getRowFieldOffsetPage1(localIdx, "feststellungen", "x")
            : 0);
        const lineYBase =
          festField.y +
          pageStartOffset -
          yOffset - 4 +
          (pageIndex === 0
            ? getPage1FieldOffset("feststellungen", "y") +
              getRowFieldOffsetPage1(localIdx, "feststellungen", "y")
            : 0);
        // Render SPT entries beneath regular feststellungen text block.
        const lineY = lineYBase - 24 - lineInRow * 10;
        const range = [entry.von_m, entry.bis_m].filter(Boolean).join(" bis ");
        const values = [entry.schlag_1, entry.schlag_2, entry.schlag_3].filter(Boolean).join(" / ");
        const entryTopY = lineYBase - 24 - lineInRow * 20;
        const headerText = range ? `SPT von ${range} m` : "SPT";
        drawText(pageIndex, headerText, festX, entryTopY, 7);
        if (values) {
          drawText(pageIndex, values, festX, entryTopY - 8, 7);
        }
      }
      );
    }
  }

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

    if (gwOverflowRows.length > 0) {
      const headerFields = {
        auftrag_nr: "auftrag_nr",
        bohrmeister: "bohrmeister",
        projekt_name: "projekt_name",
        bohrung_nr: "bohrung_nr",
        durchfuehrungszeit: "durchfuehrungszeit",
      } as const;
      const gwFieldPositions = {
        auftrag_nr: { x: 242, y: 790, size: 9 },
        bohrmeister: { x: 372, y: 790, size: 8 },
        blatt_nr: { x: 488, y: 790, size: 10 },
        projekt_name: { x: 225, y: 761, size: 10 },
        bohrung_nr: { x: 210, y: 725, size: 10 },
        durchfuehrungszeit: { x: 135, y: 695, size: 10 },
        grundwasserstand: { x: 60, y: 640, size: 9 },
        datum: { x: 150, y: 640, size: 9 },
        uhrzeit: { x: 235, y: 640, size: 9 },
        tiefe_m: { x: 315, y: 640, size: 9 },
        uk_verrohrg: { x: 390, y: 640, size: 9 },
        bohrtiefe: { x: 466, y: 640, size: 9 },
      } as const;
      const gwHeaderMaxChars: Record<keyof typeof headerFields, number> = {
        auftrag_nr: 11,
        bohrmeister: 11,
        projekt_name: 30,
        bohrung_nr: 12,
        durchfuehrungszeit: 28,
      };
      const gwRowHOverflow = (Number(data?.grundwasser_row_height) || 16) + 4;

      // Write header values on every GW supplement page.
      for (let pageOffset = 0; pageOffset < requiredGwCopies; pageOffset += 1) {
        const pageIndex = gwPageStartIndex + pageOffset;
        Object.entries(headerFields).forEach(([rowKey, fieldKey]) => {
          const value =
            data?.[fieldKey] ??
            (SV_FIELDS.find((f) => f.key === fieldKey)?.aliases ?? [])
              .map((k) => data?.[k])
              .find((v) => v != null);
          const text = value == null ? "" : String(value);
          if (!text) return;
          const pos = gwFieldPositions[rowKey as keyof typeof headerFields];
          const maxChars = gwHeaderMaxChars[rowKey as keyof typeof headerFields];
          drawText(pageIndex, String(text).slice(0, maxChars), pos.x, pos.y, pos.size);
        });
      }

      gwOverflowRows.forEach((row: any, overflowIdx: number) => {
        const pageOffset = Math.floor(overflowIdx / gwRowsPerPage);
        const localIdx = overflowIdx % gwRowsPerPage;
        const pageIndex = gwPageStartIndex + pageOffset;
        Object.entries(gwFields).forEach(([rowKey, fieldKey]) => {
          const value = row?.[rowKey];
          const text = value == null ? "" : String(value);
          if (!text) return;
          const pos = gwFieldPositions[rowKey as keyof typeof gwFields];
          drawText(pageIndex, text, pos.x, pos.y - localIdx * gwRowHOverflow + 25, pos.size);
        });
      });
    }
  }

  // Force consistent running page numbers on every generated page.
  pages.forEach((page, idx) => {
    const pageNo = String(idx + 1);
    if (idx !== 0) {
      drawStaticText(idx, String(idx + 1), 488, 790, 10);
    }
    if (idx === 0) return;
    const size = 10;
    const pageWidth = page.getWidth();
    const textWidth = font.widthOfTextAtSize(pageNo, size);
    const textX = (pageWidth - textWidth) / 2;
    const maskWidth = Math.max(26, textWidth + 12);
    const maskHeight = 22;
    const maskX = textX - (maskWidth - textWidth) / 2;
    const maskY = 28;
    page.drawRectangle({
      x: maskX,
      y: maskY,
      width: maskWidth,
      height: maskHeight,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
    drawStaticText(idx, pageNo, textX, maskY + 3, size);
  });

  return outDoc.save();
}
