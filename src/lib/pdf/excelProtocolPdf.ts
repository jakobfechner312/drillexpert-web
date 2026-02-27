import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type MessRow = {
  uhrzeit?: string;
  abstichmassAbGok?: string;
  iPerSec?: string;
  bemerkungen?: string;
};

type Messung = {
  sheetName?: string;
  bv?: string;
  bohrungNr?: string;
  blatt?: string;
  auftragsNr?: string;
  datum?: string;
  ausgefuehrtVon?: string;
  pumpeneinlaufBeiM?: string | number;
  ablaufleitungM?: string | number;
  messstelle?: string;
  hoeheGok?: string | number;
  flowRateUnit?: "lps" | "m3h" | string;
  grundwasserRows?: MessRow[];
  wiederanstiegRows?: MessRow[];
};

type Payload = Messung & {
  messungen?: Messung[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function resolveMessungen(payload: Payload): Messung[] {
  const base: Messung = {
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

  if (!Array.isArray(payload.messungen) || payload.messungen.length === 0) return [base];

  return payload.messungen.map((m) => ({
    ...base,
    ...m,
    grundwasserRows: m.grundwasserRows ?? base.grundwasserRows ?? [],
    wiederanstiegRows: m.wiederanstiegRows ?? base.wiederanstiegRows ?? [],
  }));
}

function wrapByChars(input: string, maxChars = 34): string[] {
  const src = text(input);
  if (!src) return [];
  const out: string[] = [];
  let cur = "";
  for (const word of src.split(/\s+/)) {
    if (!cur) {
      cur = word;
      continue;
    }
    if ((cur + " " + word).length <= maxChars) {
      cur += ` ${word}`;
    } else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function generateExcelProtocolPdf(
  protocolTitle: string,
  payload: Payload
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0, 0.35, 0.9);

  const messungen = resolveMessungen(payload);

  for (let i = 0; i < messungen.length; i += 1) {
    const m = messungen[i];
    const page = doc.addPage([842, 595]); // A4 landscape

    const left = 24;
    const right = 818;

    page.drawText(protocolTitle, { x: left, y: 560, size: 34, font: fontBold, color: rgb(0, 0, 0) });

    // Header grid
    const headerTop = 535;
    const headerBottom = 438;
    page.drawRectangle({ x: left, y: headerBottom, width: right - left, height: headerTop - headerBottom, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawLine({ start: { x: left, y: 505 }, end: { x: right, y: 505 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: 380, y: headerBottom }, end: { x: 380, y: headerTop }, thickness: 1, color: rgb(0, 0, 0) });

    const writeLabel = (label: string, x: number, y: number) => page.drawText(label, { x, y, size: 10, font: font, color: rgb(0, 0, 0) });
    const writeVal = (val: unknown, x: number, y: number) => page.drawText(text(val), { x, y, size: 11, font: font, color: blue });

    writeLabel("BV", 30, 487);
    writeVal(m.bv, 70, 487);

    writeLabel("Bohrung Nr.", 390, 487);
    writeVal(m.bohrungNr, 472, 487);

    writeLabel("Blatt", 390, 468);
    writeVal(m.blatt || `${i + 1}/${messungen.length}`, 472, 468);

    writeLabel("Pumpeneinlauf", 100, 448);
    writeVal(m.pumpeneinlaufBeiM, 190, 448);
    writeLabel("m", 280, 448);

    writeLabel("Ablaufleitung", 100, 428);
    writeVal(m.ablaufleitungM, 190, 428);
    writeLabel("m", 280, 428);

    writeLabel("Auftr.Nr.", 390, 448);
    writeVal(m.auftragsNr, 472, 448);

    writeLabel("Datum", 390, 428);
    writeVal(m.datum, 472, 428);

    writeLabel("Ausgeführt von", 390, 408);
    writeVal(m.ausgefuehrtVon, 472, 408);

    // table
    const top = 404;
    const bottom = 42;
    const xCols = [24, 90, 300, 360, 420, 480, 540, 818];

    page.drawRectangle({ x: xCols[0], y: bottom, width: xCols[xCols.length - 1] - xCols[0], height: top - bottom, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    for (const x of xCols.slice(1, -1)) {
      page.drawLine({ start: { x, y: bottom }, end: { x, y: top }, thickness: 1, color: rgb(0, 0, 0) });
    }

    const rowH = 20;
    for (let y = top - rowH; y >= bottom; y -= rowH) {
      page.drawLine({ start: { x: xCols[0], y }, end: { x: xCols[xCols.length - 1], y }, thickness: 1, color: rgb(0, 0, 0) });
    }

    writeLabel("Messstelle", xCols[0] + 4, top - 14);
    writeVal(m.messstelle, xCols[1] + 4, top - 14);
    writeLabel("Höhe GOK", xCols[0] + 4, top - 34);
    writeVal(m.hoeheGok, xCols[1] + 4, top - 34);

    writeLabel("Uhrzeit", xCols[0] + 4, top - 54);
    writeLabel("Abstichmaße ab GOK", xCols[1] + 8, top - 54);
    writeLabel(String(m.flowRateUnit).toLowerCase() === "m3h" ? "m³/h" : "l/s", xCols[2] + 12, top - 54);
    writeLabel("LF", xCols[3] + 14, top - 54);
    writeLabel("pH", xCols[4] + 14, top - 54);
    writeLabel("°C", xCols[5] + 14, top - 54);
    writeLabel("Bemerkungen", xCols[6] + 12, top - 54);

    const dataStartY = top - 74;
    let rowIndex = 0;

    const putRow = (r: MessRow, writeFlow: boolean) => {
      const y = dataStartY - rowIndex * rowH;
      if (y < bottom + 4) return;
      if (text(r.uhrzeit)) page.drawText(text(r.uhrzeit), { x: xCols[0] + 4, y, size: 10, font, color: blue });
      if (text(r.abstichmassAbGok)) page.drawText(text(r.abstichmassAbGok), { x: xCols[1] + 4, y, size: 10, font, color: blue });
      if (writeFlow && text(r.iPerSec)) page.drawText(text(r.iPerSec), { x: xCols[2] + 4, y, size: 10, font, color: blue });
      const lines = wrapByChars(text(r.bemerkungen), 34).slice(0, 2);
      lines.forEach((line, idxLine) => {
        page.drawText(line, { x: xCols[6] + 4, y: y - idxLine * 9, size: 9, font, color: blue });
      });
      rowIndex += 1;
    };

    let wroteFlow = false;
    for (const r of m.grundwasserRows ?? []) {
      putRow(r, !wroteFlow);
      if (!wroteFlow && text(r.iPerSec)) wroteFlow = true;
    }

    // spacer + marker
    rowIndex += 1;
    const markerY = dataStartY - rowIndex * rowH;
    if (markerY > bottom + 4) {
      page.drawText("Wiederanstieg ab GOK", { x: xCols[1] + 4, y: markerY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    }
    rowIndex += 1;

    wroteFlow = false;
    for (const r of m.wiederanstiegRows ?? []) {
      putRow(r, !wroteFlow);
      if (!wroteFlow && text(r.iPerSec)) wroteFlow = true;
    }
  }

  return new Uint8Array(await doc.save());
}
