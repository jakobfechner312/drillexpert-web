import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const CANDIDATE_TEMPLATE_NAMES = [
  "RML_TB.pdf",
  "TB_RML.pdf",
  "tagesbericht_rhein_main_link.pdf",
  "rhein_main_tagesbericht.pdf",
  "rhein-main-link-tagesbericht.pdf",
  "tagesbericht_rheinmain.pdf",
];

function getWeekdayFromDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.getDay(); // 0=So ... 6=Sa
}

function pickTemplatePath(): string {
  for (const filename of CANDIDATE_TEMPLATE_NAMES) {
    const p = path.join(process.cwd(), "public", "templates", filename);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Rhein-Main-Link Template PDF not found. Tried: ${CANDIDATE_TEMPLATE_NAMES.join(", ")}`
  );
}

function t(v: unknown, max = 48): string {
  if (v == null) return "";
  return String(v).slice(0, max);
}

export async function generateTagesberichtRheinMainLinkPdf(data: any): Promise<Uint8Array> {
  const firstExistingTemplatePath = pickTemplatePath();
  let bytes: Uint8Array | null = null;
  let pdf: PDFDocument | null = null;
  let parseError: unknown = null;

  for (const filename of CANDIDATE_TEMPLATE_NAMES) {
    const p = path.join(process.cwd(), "public", "templates", filename);
    if (!fs.existsSync(p)) continue;
    try {
      const candidateBytes = fs.readFileSync(p);
      const candidatePdf = await PDFDocument.load(candidateBytes);
      bytes = candidateBytes;
      pdf = candidatePdf;
      break;
    } catch (error) {
      parseError = error;
    }
  }

  if (!bytes || !pdf) {
    const detail =
      parseError instanceof Error ? parseError.message : "Template kann nicht gelesen werden";
    throw new Error(`Rhein-Main-Link Template invalid: ${firstExistingTemplatePath} (${detail})`);
  }

  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const blue = rgb(0, 0, 1);
  const black = rgb(0, 0, 0);
  const gridColor = rgb(0.75, 0.78, 0.82);
  const labelColor = rgb(0.42, 0.45, 0.5);

  const draw = (value: unknown, x: number, y: number, size = 10, max = 48) => {
    const text = t(value, max);
    if (!text) return;
    page.drawText(text, { x, y, size, font, color: blue });
  };
  const drawFitted = (
    value: unknown,
    x: number,
    y: number,
    maxWidth: number,
    startSize = 10,
    maxChars = 80
  ) => {
    const text = t(value, maxChars);
    if (!text) return;
    let size = startSize;
    while (size > 7 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
    page.drawText(text, { x, y, size, font, color: blue });
  };
  const wrapTextByWidth = (raw: unknown, maxWidth: number, size = 7): string[] => {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    const rows: string[] = [];
    const paragraphs = text.split(/\r?\n/);

    for (const paragraphRaw of paragraphs) {
      const paragraph = paragraphRaw.trim();
      if (!paragraph) {
        rows.push("");
        continue;
      }
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) rows.push(line);
        line = word;
      }
      if (line) rows.push(line);
    }
    return rows;
  };
  const drawTemperatureMinMax = (minValue: unknown, maxValue: unknown, x: number, y: number, size = 10) => {
    const minText = t(minValue, 12);
    const maxText = t(maxValue, 12);
    if (!minText && !maxText) return;

    let cursorX = x;
    const trackingTight = -0.7;
    const drawPart = (text: string, color: ReturnType<typeof rgb>) => {
      if (!text) return;
      page.drawText(text, { x: cursorX, y, size, font, color });
      cursorX += font.widthOfTextAtSize(text, size) + trackingTight;
    };

    if (minText) {
      drawPart(minText, blue);
      drawPart(" \u00b0C min", black);
    }
    if (minText && maxText) drawPart(" / ", black);
    if (maxText) {
      drawPart(maxText, blue);
      drawPart(" \u00b0C max", black);
    }
  };

  const drawX = (x: number, y: number, size = 12) => {
    page.drawText("X", { x, y, size, font, color: blue });
  };
  const drawBohrrichtungMarker = (value: unknown) => {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    const directionRanges: Record<string, { startX: number; endX: number }> = {
      vertikal: { startX: 100, endX: 125 },
      horizontal: { startX: 125, endX: 155 },
      schraeg: { startX: 160, endX: 180 },
      "schräg": { startX: 160, endX: 180 },
    };
    const range = directionRanges[normalized];
    if (!range) return;
    page.drawRectangle({
      x: range.startX,
      y: 677,
      width: range.endX - range.startX,
      height: 8,
      color: blue,
      opacity: 0.3,
      borderOpacity: 0,
    });
  };
  const drawSignatureFromDataUrl = async (
    dataUrl: unknown,
    box: { x: number; y: number; width: number; height: number }
  ) => {
    if (typeof dataUrl !== "string") return false;
    const trimmed = dataUrl.trim();
    if (!trimmed) return false;
    const match = trimmed.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (!match) return false;

    const format = match[1].toLowerCase();
    const base64 = match[2];
    const bytes = Buffer.from(base64, "base64");
    const image =
      format === "png"
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);

    const scale = Math.min(box.width / image.width, box.height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = box.x + (box.width - drawWidth) / 2;
    const drawY = box.y + (box.height - drawHeight) / 2;

    page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
    return true;
  };

  const drawGrid = (step = 50) => {
    const w = page.getWidth();
    const h = page.getHeight();

    for (let x = 0; x <= Math.floor(w); x += step) {
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: h },
        thickness: 0.35,
        color: gridColor,
      });
      page.drawText(String(x), {
        x: x + 2,
        y: h - 12,
        size: 8,
        font,
        color: labelColor,
      });
    }

    for (let y = 0; y <= Math.floor(h); y += step) {
      page.drawLine({
        start: { x: 0, y },
        end: { x: w, y },
        thickness: 0.35,
        color: gridColor,
      });
      page.drawText(String(y), {
        x: 4,
        y: y + 2,
        size: 8,
        font,
        color: labelColor,
      });
    }
  };

  // Für Feinjustierung vorerst immer aktiv
  drawGrid(25);

  // Koordinatenblock RML (hier feinjustieren)
  const header = {
    date: { x: 398, y: 784 },
    bohrgeraet: { x: 125, y: 717 },
    plz: { x: 280, y: 718 },
    ort: { x: 365, y: 717 },
    bohrungNr: { x: 127, y: 696 },
    berichtNr: { x: 300, y: 696 },
    zeitVon: { x: 460, y: 698 },
    zeitBis: { x: 525, y: 698 },
    pauseVon: { x: 460, y: 680 },
    pauseBis: { x: 525, y: 680 },

    bohrrichtung: { x: 145, y: 604 },
    winkelHorizontal: { x: 410, y: 604 },
    winkelNord: { x: 708, y: 604 },

    wasserspiegelAbGok: { x: 165, y: 569 },
    verrohrungAbGok: { x: 445, y: 569 },
    temperatur: { x: 400, y: 661 },
    wetter: { x: 500, y: 661 },

    bohrmeister: { x: 401, y: 646 },
    geraete: { x: 560, y: 534 },
    bohrhelfer: { x: 401, y: 625 },
  } as const;

  draw(data?.date, header.date.x, header.date.y, 11, 20);
  drawFitted(data?.device, header.bohrgeraet.x, header.bohrgeraet.y, 250, 11, 80);
  draw(data?.plz, header.plz.x, header.plz.y, 10, 12);
  draw(data?.ort, header.ort.x, header.ort.y, 10, 24);

  const firstBohrung = data?.bohrungNr || (Array.isArray(data?.tableRows) && data.tableRows[0]?.boNr ? data.tableRows[0]?.boNr : "");
  draw(firstBohrung, header.bohrungNr.x, header.bohrungNr.y, 11, 22);
  draw(data?.berichtNr, header.berichtNr.x, header.berichtNr.y, 11, 22);

  const wt = Array.isArray(data?.workTimeRows) ? data.workTimeRows : [];
  const pauses = Array.isArray(data?.breakRows) ? data.breakRows : [];
  const rows = Array.isArray(data?.tableRows) ? data.tableRows : [];
  const timeValueFontSize = 10;
  draw(wt[0]?.from, header.zeitVon.x, header.zeitVon.y, timeValueFontSize, 8);
  draw(wt[0]?.to, header.zeitBis.x, header.zeitBis.y, timeValueFontSize, 8);
  draw(pauses[0]?.from, header.pauseVon.x, header.pauseVon.y, timeValueFontSize, 8);
  draw(pauses[0]?.to, header.pauseBis.x, header.pauseBis.y, timeValueFontSize, 8);

  drawBohrrichtungMarker(data?.bohrrichtung);

  const verrohrungLayout = {
    diameterX: 238,
    meterX: 303,
    startY: 645,
    rowStep: 14,
    maxRows: 4,
    fontSize: 9,
  } as const;
  const verrohrungRows = Array.isArray(data?.verrohrungRows) && data.verrohrungRows.length
    ? data.verrohrungRows
    : rows.map((row: any) => ({ diameter: row?.verrohrtBis, meters: row?.verrohrtVon }));
  for (let i = 0; i < Math.min(verrohrungLayout.maxRows, verrohrungRows.length); i++) {
    const row = verrohrungRows[i] ?? {};
    const y = verrohrungLayout.startY - i * verrohrungLayout.rowStep;
    draw(row?.diameter, verrohrungLayout.diameterX, y, verrohrungLayout.fontSize, 10);
    draw(row?.meters, verrohrungLayout.meterX, y, verrohrungLayout.fontSize, 10);
  }
  const waterLevelRows = Array.isArray(data?.waterLevelRows) ? data.waterLevelRows : [];
  const waterLevelLayout = {
    timeX: 73,
    meterX: 160,
    startY: verrohrungLayout.startY,
    rowStep: verrohrungLayout.rowStep,
    maxRows: 4,
    fontSize: verrohrungLayout.fontSize,
  } as const;
  for (let i = 0; i < Math.min(waterLevelLayout.maxRows, waterLevelRows.length); i++) {
    const row = waterLevelRows[i] ?? {};
    const y = waterLevelLayout.startY - i * waterLevelLayout.rowStep;
    draw(row?.time, waterLevelLayout.timeX, y, waterLevelLayout.fontSize, 8);
    draw(row?.meters, waterLevelLayout.meterX, y, waterLevelLayout.fontSize, 8);
  }
  if (!waterLevelRows.length && data?.ruhewasserVorArbeitsbeginnM != null) {
    draw(data?.ruhewasserVorArbeitsbeginnM, waterLevelLayout.meterX, waterLevelLayout.startY, waterLevelLayout.fontSize, 10);
  }
  if (!verrohrungRows.length) {
    draw(data?.verrohrungAbGok, header.verrohrungAbGok.x, header.verrohrungAbGok.y, 10, 10);
  }
  const tempMax = data?.weather?.tempMaxC;
  const tempMin = data?.weather?.tempMinC;
  drawTemperatureMinMax(tempMin, tempMax, header.temperatur.x, header.temperatur.y, 7);
  const weatherLabel = Array.isArray(data?.weather?.conditions)
    ? data.weather.conditions.join("/")
    : data?.weather;
  draw(weatherLabel, header.wetter.x, header.wetter.y, 9, 20);

  draw(data?.workers?.[0]?.name, header.bohrmeister.x, header.bohrmeister.y, 7, 18);
  const deviceChecks = new Set(
    String(data?.vehicles ?? data?.geraete ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const deviceCross = {
    LKW: { x: 479, y: 640 },
    "Radlader/Dumper": { x: 479, y: 628 },
    Wasserwagen: { x: 479, y: 616 },
    Kompressor: { x: 479, y: 604 },
  } as const;
  for (const [label, pos] of Object.entries(deviceCross)) {
    if (!deviceChecks.has(label)) continue;
    drawX(pos.x, pos.y, 11);
  }
  const bohrhelferJoined = Array.isArray(data?.workers)
    ? data.workers
        .slice(1)
        .map((w: { name?: unknown }) => String(w?.name ?? "").trim())
        .filter((n: string) => n.length > 0)
        .slice(0, 3)
    : "";
  if (Array.isArray(bohrhelferJoined)) {
    const helperFontSize = 8;
    const helperLineStep = 10;
    bohrhelferJoined.forEach((name, idx) => {
      draw(name, header.bohrhelfer.x, header.bohrhelfer.y - idx * helperLineStep, helperFontSize, 24);
    });
  }

  // Wochentag markieren
  const weekdayX = { mo: 261, di: 277, mi: 295, do: 315, fr: 332, sa: 348, so: 368 };
  const weekdayY = 780;
  const weekday = getWeekdayFromDate(String(data?.date ?? ""));
  if (weekday === 1) drawX(weekdayX.mo, weekdayY);
  if (weekday === 2) drawX(weekdayX.di, weekdayY);
  if (weekday === 3) drawX(weekdayX.mi, weekdayY);
  if (weekday === 4) drawX(weekdayX.do, weekdayY);
  if (weekday === 5) drawX(weekdayX.fr, weekdayY);
  if (weekday === 6) drawX(weekdayX.sa, weekdayY);
  if (weekday === 0) drawX(weekdayX.so, weekdayY);

  // Haupttabelle (oben Mitte)
  const tableYStart = 544;
  const tableYStep = 18;
  const tableCols = {
    aufschluss: 60,
    krone: 121,
    tiefeVon: 170,
    tiefeBis: 220,
    beschreibung: 470,
    besonderheiten: 768,
  } as const;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] ?? {};
    const rowHasValue = Object.values(r).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (v == null) return false;
      if (typeof v === "object") return Object.values(v as Record<string, unknown>).some((vv) => String(vv ?? "").trim() !== "");
      return String(v).trim() !== "";
    });
    if (!rowHasValue) continue;
    const y = tableYStart - i * tableYStep;
    const bohrverfahren = String(r?.verrohrtFlags?.[0] ?? r?.verrohrtFlags?.join("/") ?? "").trim();
    const schappeDm = String(r?.schappeDurchmesser ?? "").trim();
    const aufschlussLabelMap: Record<string, string> = {
      Rammkernbohrung: "Rammkern.",
      Rotationsbohrung: "Rotations.",
      Vollbohrung: "Vollbohrung",
    };
    const aufschlussLabel = aufschlussLabelMap[bohrverfahren] ?? (r?.verrohrtFlags?.join("/") || "Spülung");
    if (bohrverfahren === "Rammkernbohrung" && schappeDm) {
      // Two-line entry: start slightly higher to avoid clipping at top border.
      draw("Rammkern.", tableCols.aufschluss, y + 6, 6.5, 14);
      draw("Schappe", tableCols.aufschluss, y - 2, 6.5, 14);
      draw(r?.boNr, tableCols.krone, y + 6, 6.5, 12);
      draw(schappeDm, tableCols.krone, y - 2, 6.5, 12);
    } else {
      draw(aufschlussLabel, tableCols.aufschluss, y, 7, 14);
      draw(r?.boNr, tableCols.krone, y, 7, 12);
    }
    draw(r?.gebohrtVon, tableCols.tiefeVon, y, 7, 8);
    draw(r?.gebohrtBis, tableCols.tiefeBis, y, 7, 8);
    draw(r?.hindernisZeit ?? "", tableCols.besonderheiten, y, 6, 16);
  }

  // Freitextfeld "Beschreibung der Tätigkeiten":
  // gleiche Zeilenhöhe wie Tabellenloop, innerhalb des Feldes X 250..555 und Y 375..tableYStart
  const textField = { minX: 255, maxX: 555, minY: 375, maxY: tableYStart } as const;
  const textSize = 7;
  const wrapped = wrapTextByWidth(data?.otherWork, textField.maxX - textField.minX, textSize);
  const maxRows = Math.max(0, Math.floor((textField.maxY - textField.minY) / tableYStep) + 1);
  for (let i = 0; i < Math.min(maxRows, wrapped.length); i++) {
    const y = tableYStart - i * tableYStep;
    if (y < textField.minY) break;
    draw(wrapped[i], textField.minX, y, textSize, 220);
  }

  // Ausbau / Verfüllung / SPT-Versuche (unten)
  const pegelRows = Array.isArray(data?.pegelAusbauRows) ? data.pegelAusbauRows : [];
  const lowerYStart = 310;
  const lowerYStep = tableYStep;
  const lowerCols = {
    ausbauVon: 75,
    ausbauBis: tableCols.krone,
    ausbauRohr: 165,
    verfVon: 264,
    verfBis: 330,
    verfMaterial: 368,
    sptVon: 450,
    sptBis: 477,
    sptA: 504,
    sptB: 527,
    sptC: 552,
  } as const;
  const selectedPegelDm = pegelRows.find((row: any) => String(row?.pegelDm ?? "").trim().length > 0)?.pegelDm;
  draw(selectedPegelDm, 195, 360, 9, 14);
  for (let i = 0; i < Math.min(10, pegelRows.length); i++) {
    const p = pegelRows[i] ?? {};
    const rowHasValue = Object.values(p).some((v) => {
      if (typeof v === "boolean") return v;
      return String(v ?? "").trim() !== "";
    });
    if (!rowHasValue) continue;
    const y = lowerYStart - i * lowerYStep;
    const explicitType = String(p?.ausbauArtType ?? "").trim();
    const customAusbauArt = String(p?.ausbauArtCustom ?? "").trim();
    const ausbauArt = explicitType === "stahlaufsatz"
      ? "Stahlaufsatz"
      : explicitType === "vollrohr"
        ? "Vollrohr"
        : explicitType === "individuell"
          ? (customAusbauArt || "Individuell")
          : p?.aufsatzStahlVon || p?.aufsatzStahlBis
            ? "Stahlaufsatz"
            : p?.rohrePvcVon || p?.rohrePvcBis
              ? "Vollrohr"
              : customAusbauArt || "Filter";
    const sw = String(p?.schlitzweiteSwMm ?? "").trim();
    const isFilter = explicitType === "filter" || (!explicitType && ausbauArt === "Filter");
    const ausbauLabel = isFilter && sw ? `${ausbauArt}, SW: ${sw} mm` : ausbauArt;

    draw(p?.filterVon, lowerCols.ausbauVon, y, 9, 8);
    draw(p?.filterBis, lowerCols.ausbauBis, y, 9, 8);
    draw(ausbauLabel, lowerCols.ausbauRohr, y, 9, 32);

    draw(p?.tonVon, lowerCols.verfVon, y, 9, 8);
    draw(p?.tonBis, lowerCols.verfBis, y, 9, 8);
    draw(p?.filterkiesKoernung, lowerCols.verfMaterial, y, 8, 24);

    const s = rows[i]?.spt ? String(rows[i].spt).split("/") : [];
    draw(rows[i]?.gebohrtVon, lowerCols.sptVon, y, 9, 8);
    draw(rows[i]?.gebohrtBis, lowerCols.sptBis, y, 9, 8);
    draw(s[0], lowerCols.sptA, y, 9, 6);
    draw(s[1], lowerCols.sptB, y, 9, 6);
    draw(s[2], lowerCols.sptC, y, 9, 6);
  }

  // Footer-Bereiche
  draw(data?.besucher, 165, 195, 10, 96);
  draw(data?.sheVorfaelle, 165, 172, 10, 96);
  const sonstigeField = { x: 200, y: 150, maxX: 555, lineStep: 14, maxLines: 3 } as const;
  const sonstigeLines = wrapTextByWidth(
    data?.toolBoxTalks,
    sonstigeField.maxX - sonstigeField.x,
    10
  );
  for (let i = 0; i < Math.min(sonstigeField.maxLines, sonstigeLines.length); i++) {
    draw(sonstigeLines[i], sonstigeField.x, sonstigeField.y - i * sonstigeField.lineStep, 10, 120);
  }
  const rawBgChecks = String(data?.taeglicheUeberpruefungBg ?? "").trim();
  const bgChecks = new Set(
    rawBgChecks.includes("|")
      ? rawBgChecks
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
      : rawBgChecks
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
  );
  if (bgChecks.has("Bolzen") && bgChecks.has("Lager")) {
    bgChecks.delete("Bolzen");
    bgChecks.delete("Lager");
    bgChecks.add("Bolzen, Lager");
  }
  const bgCross = {
    "Betriebsflüssigkeiten": { x: 161, y: 101 },
    "Seile und Tragmittel": { x: 161, y: 87 },
    Schmierung: { x: 317, y: 100 },
    Hydraulik: { x: 316, y: 86 },
    "Bolzen, Lager": { x: 458, y: 101 },
    "ev. Leckagen": { x: 458, y: 86 },
  } as const;
  for (const [label, pos] of Object.entries(bgCross)) {
    if (!bgChecks.has(label)) continue;
    drawX(pos.x, pos.y, 11);
  }

  await drawSignatureFromDataUrl(data?.signatures?.drillerSigPng, {
    x: 60,
    y: 42,
    width: 240,
    height: 30,
  });
  await drawSignatureFromDataUrl(data?.signatures?.clientOrManagerSigPng, {
    x: 325,
    y: 42,
    width: 225,
    height: 30,
  });

  return pdf.save();
}
