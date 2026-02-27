import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type KlarspuelHeaderPayload = {
  bv?: string;
  bohrungNr?: string;
  blatt?: string;
  auftragsNr?: string;
  datum?: string;
  ausgefuehrtVon?: string;
  pumpeneinlaufBeiM?: number | string;
  ablaufleitungM?: number | string;
  messstelle?: string;
  hoeheGok?: number | string;
  flowRateUnit?: "lps" | "m3h" | string;
  grundwasserRows?: KlarspuelMessRowPayload[];
  wiederanstiegRows?: KlarspuelMessRowPayload[];
  messungen?: KlarspuelMessungPayload[];
};

type KlarspuelMessungPayload = {
  sheetName?: string;
  bv?: string;
  bohrungNr?: string;
  blatt?: string;
  auftragsNr?: string;
  datum?: string;
  ausgefuehrtVon?: string;
  pumpeneinlaufBeiM?: number | string;
  ablaufleitungM?: number | string;
  messstelle?: string;
  hoeheGok?: number | string;
  flowRateUnit?: "lps" | "m3h" | string;
  grundwasserRows?: KlarspuelMessRowPayload[];
  wiederanstiegRows?: KlarspuelMessRowPayload[];
};

type KlarspuelMessRowPayload = {
  uhrzeit?: string;
  abstichmassAbGok?: string;
  iPerSec?: string;
  bemerkungen?: string;
};

const TEMPLATE_PATH = path.join(process.cwd(), "public", "templates", "KlarSpuel.xlsx");
const EXCEL_BETA_USERS = new Set(
  (process.env.EXCEL_BETA_USERS ?? process.env.NEXT_PUBLIC_EXCEL_BETA_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function setIfPresent(sheet: ExcelJS.Worksheet, cell: string, value: unknown) {
  const text = asText(value);
  if (!text) return;
  sheet.getCell(cell).value = text;
}

function getFlowRateHeaderLabel(unit: unknown): string {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (normalized === "m3h") return "m³/h";
  return "l/s";
}

function estimateWrappedLineCount(text: string, approxCharsPerLine = 20, maxLines = 8): number {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return 1;

  const paragraphs = normalized.split("\n");
  let total = 0;

  for (const paragraph of paragraphs) {
    const p = paragraph.trim();
    if (!p) {
      total += 1;
      continue;
    }

    const words = p.split(/\s+/);
    let currentLen = 0;
    let lines = 1;

    for (const word of words) {
      let wordLen = word.length;
      if (currentLen === 0) {
        if (wordLen <= approxCharsPerLine) {
          currentLen = wordLen;
          continue;
        }
        lines += Math.floor((wordLen - 1) / approxCharsPerLine);
        currentLen = ((wordLen - 1) % approxCharsPerLine) + 1;
        continue;
      }
      if (currentLen + 1 + wordLen <= approxCharsPerLine) {
        currentLen += 1 + wordLen;
      } else {
        lines += 1;
        if (wordLen <= approxCharsPerLine) {
          currentLen = wordLen;
          continue;
        }
        lines += Math.floor((wordLen - 1) / approxCharsPerLine);
        currentLen = ((wordLen - 1) % approxCharsPerLine) + 1;
      }
    }

    total += lines;
  }

  return Math.max(1, Math.min(maxLines, total));
}

function applyBemerkungCellLayout(sheet: ExcelJS.Worksheet, rowNo: number, bemerkung: unknown) {
  const cell = sheet.getCell(`I${rowNo}`);
  const text = asText(bemerkung);

  cell.alignment = {
    ...(cell.alignment ?? {}),
    wrapText: true,
    vertical: "top",
  };

  const lineCount = estimateWrappedLineCount(text, 20, 8);
  const baseRowHeightPt = 18;
  const extraLineHeightPt = 15;
  sheet.getRow(rowNo).height = baseRowHeightPt + (lineCount - 1) * extraLineHeightPt;
}

function writeMessRows(
  sheet: ExcelJS.Worksheet,
  rows: KlarspuelMessRowPayload[] | undefined,
  startRow: number,
  options?: { clearCount?: number; writeIPerSecOnce?: boolean }
) {
  const clearCount = options?.clearCount ?? Math.max(rows?.length ?? 0, 0);
  const writeIPerSecOnce = options?.writeIPerSecOnce ?? false;

  for (let i = 0; i < clearCount; i += 1) {
    const rowNo = startRow + i;
    sheet.getCell(`A${rowNo}`).value = null; // Dauer
    sheet.getCell(`B${rowNo}`).value = null; // Abstichmaß ab GOK (linke Zelle des Merge-Bereichs)
    sheet.getCell(`E${rowNo}`).value = null; // l/sec
    sheet.getCell(`I${rowNo}`).value = null; // Bemerkungen
    applyBemerkungCellLayout(sheet, rowNo, "");
  }

  let wroteIPerSec = false;
  (rows ?? []).forEach((row, index) => {
    const rowNo = startRow + index;
    setIfPresent(sheet, `A${rowNo}`, row.uhrzeit);
    setIfPresent(sheet, `B${rowNo}`, row.abstichmassAbGok);
    if (writeIPerSecOnce) {
      const iPerSecText = asText(row.iPerSec);
      if (!wroteIPerSec && iPerSecText) {
        sheet.getCell(`E${rowNo}`).value = iPerSecText;
        wroteIPerSec = true;
      }
    } else {
      setIfPresent(sheet, `E${rowNo}`, row.iPerSec);
    }
    setIfPresent(sheet, `I${rowNo}`, row.bemerkungen);
    applyBemerkungCellLayout(sheet, rowNo, row.bemerkungen);
  });
}

function clearTableArea(sheet: ExcelJS.Worksheet, startRow: number, rowCount: number) {
  for (let i = 0; i < rowCount; i += 1) {
    const rowNo = startRow + i;
    sheet.getCell(`A${rowNo}`).value = null; // Dauer
    sheet.getCell(`B${rowNo}`).value = null; // Abstichmaß / Marker
    sheet.getCell(`E${rowNo}`).value = null; // l/sec
    sheet.getCell(`I${rowNo}`).value = null; // Bemerkungen
    applyBemerkungCellLayout(sheet, rowNo, "");
  }
}

function ensureExcelBetaUser(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !EXCEL_BETA_USERS.has(normalized)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function deepClone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function cloneWorksheetFromTemplate(
  workbook: ExcelJS.Workbook,
  templateSheet: ExcelJS.Worksheet,
  name: string
) {
  const sheet = workbook.addWorksheet(name);
  sheet.properties = { ...templateSheet.properties };
  sheet.pageSetup = { ...templateSheet.pageSetup };
  sheet.headerFooter = { ...templateSheet.headerFooter };
  sheet.state = templateSheet.state;
  sheet.views = (templateSheet.views ?? []).map((view) => ({ ...view }));
  ensureWorksheetMargins(sheet);

  templateSheet.columns.forEach((column, index) => {
    const targetColumn = sheet.getColumn(index + 1);
    if (column.width != null) targetColumn.width = column.width;
    if (column.hidden != null) targetColumn.hidden = column.hidden;
    if (column.outlineLevel != null) targetColumn.outlineLevel = column.outlineLevel;
    if (column.style) {
      targetColumn.style = deepClone(column.style);
    }
  });

  for (let rowNo = 1; rowNo <= templateSheet.rowCount; rowNo += 1) {
    const srcRow = templateSheet.getRow(rowNo);
    const dstRow = sheet.getRow(rowNo);
    if (srcRow.height != null) dstRow.height = srcRow.height;
    if (srcRow.hidden != null) dstRow.hidden = srcRow.hidden;

    srcRow.eachCell({ includeEmpty: true }, (srcCell, colNo) => {
      const dstCell = dstRow.getCell(colNo);
      dstCell.value = srcCell.value;
      dstCell.style = deepClone(srcCell.style ?? {});
      if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
      dstCell.protection = deepClone(srcCell.protection ?? {});
    });
  }

  const merges = ((templateSheet as any).model?.merges ?? []) as string[];
  for (const merge of merges) {
    try {
      sheet.mergeCells(merge);
    } catch {
      // skip duplicate/invalid merge ranges
    }
  }

  copyWorksheetImages(templateSheet, sheet);
  stripWorksheetComments(sheet);
  return sheet;
}

function copyWorksheetImages(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet) {
  if (typeof source.getImages !== "function") return;
  const images = source.getImages();
  for (const image of images) {
    const imageId = Number((image as any).imageId);
    if (!Number.isFinite(imageId)) continue;
    const range: any = image.range ?? {};

    // Fallback: pull stored media range from worksheet model if available.
    const mediaRange = deepClone(
      ((source as any).model?.media ?? []).find((entry: any) => Number(entry?.imageId) === imageId)?.range
    );
    if (mediaRange && typeof mediaRange === "object") {
      target.addImage(imageId, mediaRange as any);
      continue;
    }

    // Last fallback: copy only anchor geometry fields to avoid circular refs in image.range.
    const payload: any = {
      editAs: range.editAs,
      hyperlinks: range.hyperlinks,
    };
    if (range.tl) {
      payload.tl = {
        col: range.tl.col,
        row: range.tl.row,
        nativeCol: range.tl.nativeCol,
        nativeRow: range.tl.nativeRow,
        nativeColOff: range.tl.nativeColOff,
        nativeRowOff: range.tl.nativeRowOff,
      };
    }
    if (range.br) {
      payload.br = {
        col: range.br.col,
        row: range.br.row,
        nativeCol: range.br.nativeCol,
        nativeRow: range.br.nativeRow,
        nativeColOff: range.br.nativeColOff,
        nativeRowOff: range.br.nativeRowOff,
      };
    }
    if (range.ext) payload.ext = { width: range.ext.width, height: range.ext.height };
    target.addImage(imageId, payload);
  }
}

function stripWorksheetComments(sheet: ExcelJS.Worksheet) {
  for (let rowNo = 1; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    row.eachCell({ includeEmpty: true }, (cell) => {
      if ((cell as any).note != null) {
        (cell as any).note = undefined;
      }
    });
  }
}

function ensureWorksheetMargins(sheet: ExcelJS.Worksheet) {
  const setup: any = sheet.pageSetup ?? {};
  const defaults = {
    left: 0.7,
    right: 0.7,
    top: 0.75,
    bottom: 0.75,
    header: 0.3,
    footer: 0.3,
  };
  const margins = setup.margins && typeof setup.margins === "object" ? setup.margins : {};
  setup.margins = {
    left: Number.isFinite(Number(margins.left)) ? Number(margins.left) : defaults.left,
    right: Number.isFinite(Number(margins.right)) ? Number(margins.right) : defaults.right,
    top: Number.isFinite(Number(margins.top)) ? Number(margins.top) : defaults.top,
    bottom: Number.isFinite(Number(margins.bottom)) ? Number(margins.bottom) : defaults.bottom,
    header: Number.isFinite(Number(margins.header)) ? Number(margins.header) : defaults.header,
    footer: Number.isFinite(Number(margins.footer)) ? Number(margins.footer) : defaults.footer,
  };
  sheet.pageSetup = setup;
}

function normalizeSheetName(value: string): string {
  const cleaned = value
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Messung";
  return cleaned.slice(0, 31);
}

function makeUniqueSheetName(baseName: string, usedNames: Set<string>): string {
  const base = normalizeSheetName(baseName);
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const maxBaseLen = Math.max(1, 31 - suffixText.length);
    const candidate = `${base.slice(0, maxBaseLen)}${suffixText}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  const fallback = `Messung_${Date.now()}`.slice(0, 31);
  usedNames.add(fallback);
  return fallback;
}

function makeUniqueInternalSheetName(workbook: ExcelJS.Workbook, base: string): string {
  const normalizedBase = normalizeSheetName(base) || "Messung";
  const existing = new Set(workbook.worksheets.map((ws) => String(ws.name ?? "")));
  if (!existing.has(normalizedBase)) return normalizedBase;

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = `_${suffix}`;
    const maxBaseLen = Math.max(1, 31 - suffixText.length);
    const candidate = `${normalizedBase.slice(0, maxBaseLen)}${suffixText}`;
    if (!existing.has(candidate)) return candidate;
    suffix += 1;
  }

  return `Messung_${Date.now()}`.slice(0, 31);
}

function resolveMessungen(payload: KlarspuelHeaderPayload): KlarspuelMessungPayload[] {
  const base: KlarspuelMessungPayload = {
    bv: payload.bv,
    bohrungNr: payload.bohrungNr,
    blatt: payload.blatt,
    auftragsNr: payload.auftragsNr,
    datum: payload.datum,
    ausgefuehrtVon: payload.ausgefuehrtVon,
    pumpeneinlaufBeiM: payload.pumpeneinlaufBeiM,
    ablaufleitungM: payload.ablaufleitungM,
    messstelle: payload.messstelle,
    hoeheGok: payload.hoeheGok,
    flowRateUnit: payload.flowRateUnit,
    grundwasserRows: payload.grundwasserRows ?? [],
    wiederanstiegRows: payload.wiederanstiegRows ?? [],
  };

  if (!Array.isArray(payload.messungen) || payload.messungen.length === 0) {
    return [base];
  }

  return payload.messungen.map((messung) => ({
    ...base,
    ...messung,
    grundwasserRows: messung.grundwasserRows ?? base.grundwasserRows ?? [],
    wiederanstiegRows: messung.wiederanstiegRows ?? base.wiederanstiegRows ?? [],
  }));
}

function writeMessungToSheet(
  sheet: ExcelJS.Worksheet,
  messung: KlarspuelMessungPayload,
  sheetIndex: number,
  totalSheets: number
) {
  // Headerfelder
  setIfPresent(sheet, "B5", messung.bv);
  setIfPresent(sheet, "I6", messung.bohrungNr);
  sheet.getCell("I7").value = `${sheetIndex + 1}/${Math.max(1, totalSheets)}`;
  setIfPresent(sheet, "C9", messung.pumpeneinlaufBeiM);
  setIfPresent(sheet, "I9", messung.auftragsNr);
  setIfPresent(sheet, "I10", messung.datum);
  setIfPresent(sheet, "C11", messung.ablaufleitungM);
  setIfPresent(sheet, "I11", messung.ausgefuehrtVon);
  setIfPresent(sheet, "C13", messung.messstelle);
  setIfPresent(sheet, "C14", messung.hoeheGok);
  sheet.getCell("E15").value = getFlowRateHeaderLabel(messung.flowRateUnit);

  // Tabellenbereiche (Klarspuel-Messdaten)
  const grundwasserStartRow = 16;
  const grundwasserRows = messung.grundwasserRows ?? [];
  const wiederanstiegRows = messung.wiederanstiegRows ?? [];

  clearTableArea(sheet, grundwasserStartRow, 120);

  writeMessRows(sheet, grundwasserRows, grundwasserStartRow, {
    clearCount: grundwasserRows.length,
    writeIPerSecOnce: true,
  });

  const wiederanstiegMarkerRow = grundwasserStartRow + grundwasserRows.length + 2;
  const wiederanstiegStartRow = wiederanstiegMarkerRow + 1;

  sheet.getCell(`B${wiederanstiegMarkerRow}`).value = "Wiederanstieg ab GOK";
  sheet.getCell(`C${wiederanstiegMarkerRow}`).value = null;
  sheet.getCell(`D${wiederanstiegMarkerRow}`).value = null;

  writeMessRows(sheet, wiederanstiegRows, wiederanstiegStartRow, {
    clearCount: wiederanstiegRows.length,
    writeIPerSecOnce: true,
  });
}

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const forbidden = ensureExcelBetaUser(auth.user?.email);
  if (forbidden) return forbidden;

  return NextResponse.json({
    ok: true,
    route: "/api/excel/klarspuel/header",
    method: "POST",
    note: "Befuellt nur Headerfelder des KlarSpuel-Templates. Tabellenzeilen kommen spaeter.",
    examplePayload: {
      bv: "BV Musterprojekt",
      bohrungNr: "B-12",
      blatt: "1",
      auftragsNr: "DEMO-2026-001",
      datum: "23.02.2026",
      ausgefuehrtVon: "Max Mustermann",
      pumpeneinlaufBeiM: "12,50",
      ablaufleitungM: "8,20",
      messstelle: "GWMS-1",
      hoeheGok: "123,45",
      flowRateUnit: "lps",
      grundwasserRows: [{ uhrzeit: "0:01:00", abstichmassAbGok: "5,20", iPerSec: "1,2" }],
      wiederanstiegRows: [{ uhrzeit: "0:01:00", abstichmassAbGok: "5,10" }],
      messungen: [
        {
          sheetName: "B-12_M1",
          bohrungNr: "B-12",
        },
        {
          sheetName: "B-13_M1",
          bohrungNr: "B-13",
          grundwasserRows: [{ uhrzeit: "0:01:00", abstichmassAbGok: "4,80", iPerSec: "1,4" }],
        },
      ],
    },
    mappedCells: {
      bv: "B5",
      bohrungNr: "I6",
      blatt: "I7",
      pumpeneinlaufBeiM: "C9",
      auftragsNr: "I9",
      datum: "I10",
      ablaufleitungM: "C11",
      ausgefuehrtVon: "I11",
      messstelle: "C13",
      hoeheGok: "C14",
    },
    tableMapping: {
      grundwasserStartRow: 16,
      wiederanstieg: "Dynamisch: nach Grundwasser + 2 Leerzeilen + Markerzeile 'Wiederanstieg'",
      columns: {
        dauer: "A",
        abstichmassAbGok: "B",
        iPerSec: "E",
        bemerkungen: "I",
      },
    },
  });
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;
    const forbidden = ensureExcelBetaUser(auth.user?.email);
    if (forbidden) return forbidden;

    let payload: KlarspuelHeaderPayload;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = (await req.json()) as KlarspuelHeaderPayload;
    } else {
      const form = await req.formData();
      const payloadRaw = form.get("payload_json") ?? form.get("payload");
      if (typeof payloadRaw !== "string" || !payloadRaw.trim()) {
        return NextResponse.json({ error: "Missing payload_json" }, { status: 400 });
      }
      payload = JSON.parse(payloadRaw) as KlarspuelHeaderPayload;
    }
    const templateBytes = Buffer.from(await readFile(TEMPLATE_PATH));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBytes as any);

    const templateSheet = workbook.getWorksheet("Tabelle1") ?? workbook.worksheets[0];
    if (!templateSheet) {
      return NextResponse.json({ error: "Vorlageblatt 'Tabelle1' nicht gefunden." }, { status: 404 });
    }
    ensureWorksheetMargins(templateSheet);
    stripWorksheetComments(templateSheet);

    // Keep only the base template sheet; drop unused static sheets from the source template.
    for (const ws of [...workbook.worksheets]) {
      if (ws.id !== templateSheet.id) {
        workbook.removeWorksheet(ws.id);
      }
    }
    const messungen = resolveMessungen(payload);
    const sheets: ExcelJS.Worksheet[] = [templateSheet];
    for (let i = 1; i < messungen.length; i += 1) {
      const internalName = makeUniqueInternalSheetName(workbook, `Messung_${i + 1}`);
      const clone = cloneWorksheetFromTemplate(workbook, templateSheet, internalName);
      sheets.push(clone);
    }

    const usedNames = new Set<string>();
    const totalSheets = messungen.length;
    messungen.forEach((messung, idx) => {
      const sheet = sheets[idx];
      if (!sheet) return;
      const preferredName = String(messung.sheetName ?? "").trim()
        || String(messung.bohrungNr ?? "").trim()
        || `Messung ${idx + 1}`;
      sheet.name = makeUniqueSheetName(preferredName, usedNames);
      writeMessungToSheet(sheet, messung, idx, totalSheets);
    });

    // Final safety-net: some template clones can still carry invalid margin values.
    workbook.worksheets.forEach((ws) => {
      ensureWorksheetMargins(ws);
      stripWorksheetComments(ws);
    });

    const out = await workbook.xlsx.writeBuffer();
    const body = Buffer.from(out as ArrayBuffer);

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `KlarSpuel-Header-${stamp}.xlsx`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
