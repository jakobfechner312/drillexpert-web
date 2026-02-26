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
        // Excel wraps long tokens without spaces; reserve multiple visual lines.
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

  // Row 16+ in the template is compact; grow only when needed and cap to keep the layout usable.
  const lineCount = estimateWrappedLineCount(text, 20, 8);
  const baseRowHeightPt = 18;
  const extraLineHeightPt = 15;
  sheet.getRow(rowNo).height = baseRowHeightPt + (lineCount - 1) * extraLineHeightPt;
}

function getFlowRateHeaderLabel(unit: unknown): string {
  const normalized = String(unit ?? "").trim().toLowerCase();
  if (normalized === "m3h") return "m³/h";
  return "l/s";
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

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const forbidden = ensureExcelBetaUser(auth.user?.email);
  if (forbidden) return forbidden;

  return NextResponse.json({
    ok: true,
    route: "/api/excel/pumpversuch/header",
    method: "POST",
    note: "Befuellt das Pumpversuch-Formular (aktuell noch auf KlarSpuel-Template-Basis).",
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

    const sheet = workbook.getWorksheet("Tabelle1");
    if (!sheet) {
      return NextResponse.json({ error: "Vorlageblatt 'Tabelle1' nicht gefunden." }, { status: 404 });
    }

    // Headerfelder
    sheet.getCell("A3").value = "Pumpversuch";
    setIfPresent(sheet, "B5", payload.bv);
    setIfPresent(sheet, "I6", payload.bohrungNr);
    setIfPresent(sheet, "I7", payload.blatt);
    setIfPresent(sheet, "C9", payload.pumpeneinlaufBeiM);
    setIfPresent(sheet, "I9", payload.auftragsNr);
    setIfPresent(sheet, "I10", payload.datum);
    setIfPresent(sheet, "C11", payload.ablaufleitungM);
    setIfPresent(sheet, "I11", payload.ausgefuehrtVon);
    setIfPresent(sheet, "C13", payload.messstelle);
    setIfPresent(sheet, "C14", payload.hoeheGok);
    sheet.getCell("E15").value = getFlowRateHeaderLabel(payload.flowRateUnit);

    // Tabellenbereiche (Pumpversuch-Messdaten auf KlarSpuel-Template)
    const grundwasserStartRow = 16;
    const grundwasserRows = payload.grundwasserRows ?? [];
    const wiederanstiegRows = payload.wiederanstiegRows ?? [];

    // Genug Bereich leeren, damit alte Werte/Tests nicht stehen bleiben.
    clearTableArea(sheet, grundwasserStartRow, 120);

    writeMessRows(sheet, grundwasserRows, grundwasserStartRow, {
      clearCount: grundwasserRows.length,
      writeIPerSecOnce: true,
    });

    const wiederanstiegMarkerRow = grundwasserStartRow + grundwasserRows.length + 2;
    const wiederanstiegStartRow = wiederanstiegMarkerRow + 1;

    // Marker mit Abstand zwischen den Blöcken (2 Leerzeilen) in B:D
    sheet.getCell(`B${wiederanstiegMarkerRow}`).value = "Wiederanstieg ab GOK";
    sheet.getCell(`C${wiederanstiegMarkerRow}`).value = null;
    sheet.getCell(`D${wiederanstiegMarkerRow}`).value = null;

    writeMessRows(sheet, wiederanstiegRows, wiederanstiegStartRow, {
      clearCount: wiederanstiegRows.length,
      writeIPerSecOnce: true,
    });

    const out = await workbook.xlsx.writeBuffer();
    const body = Buffer.from(out as ArrayBuffer);

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `Pumpversuch-${stamp}.xlsx`;

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
