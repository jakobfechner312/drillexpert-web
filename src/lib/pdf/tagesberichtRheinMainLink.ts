import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

const CANDIDATE_TEMPLATE_NAMES = [
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
  const templatePath = pickTemplatePath();
  const bytes = fs.readFileSync(templatePath);
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const blue = rgb(0, 0, 1);
  const gridColor = rgb(0.75, 0.78, 0.82);
  const labelColor = rgb(0.42, 0.45, 0.5);

  const draw = (value: unknown, x: number, y: number, size = 10, max = 48) => {
    const text = t(value, max);
    if (!text) return;
    page.drawText(text, { x, y, size, font, color: blue });
  };

  const drawX = (x: number, y: number, size = 12) => {
    page.drawText("X", { x, y, size, font, color: blue });
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
  drawGrid(50);

  // Koordinatenblock RML (hier feinjustieren)
  const header = {
    date: { x: 520, y: 786 },
    bauvorhaben: { x: 145, y: 742 },
    firma: { x: 430, y: 742 },
    auftraggeber: { x: 145, y: 712 },
    bohrgeraet: { x: 145, y: 674 },
    plz: { x: 410, y: 674 },
    ort: { x: 520, y: 674 },
    bohrungNr: { x: 165, y: 639 },
    berichtNr: { x: 365, y: 639 },
    zeitVon: { x: 620, y: 639 },
    zeitBis: { x: 730, y: 639 },
    pauseVon: { x: 676, y: 603 },
    pauseBis: { x: 733, y: 603 },

    bohrrichtung: { x: 145, y: 604 },
    winkelHorizontal: { x: 410, y: 604 },
    winkelNord: { x: 708, y: 604 },

    wasserspiegelAbGok: { x: 165, y: 569 },
    verrohrungAbGok: { x: 445, y: 569 },
    temperatur: { x: 625, y: 569 },
    wetter: { x: 730, y: 569 },

    bohrmeister: { x: 625, y: 534 },
    geraete: { x: 730, y: 534 },
    bohrhelfer: { x: 625, y: 500 },
  } as const;

  draw(data?.date, header.date.x, header.date.y, 11, 20);
  draw(data?.project, header.bauvorhaben.x, header.bauvorhaben.y, 11, 64);
  draw(data?.firma, header.firma.x, header.firma.y, 10, 24);
  draw(data?.client, header.auftraggeber.x, header.auftraggeber.y, 11, 64);
  draw(data?.device, header.bohrgeraet.x, header.bohrgeraet.y, 11, 28);
  draw(data?.plz, header.plz.x, header.plz.y, 10, 12);
  draw(data?.ort, header.ort.x, header.ort.y, 10, 24);

  const firstBohrung = data?.bohrungNr || (Array.isArray(data?.tableRows) && data.tableRows[0]?.boNr ? data.tableRows[0]?.boNr : "");
  draw(firstBohrung, header.bohrungNr.x, header.bohrungNr.y, 11, 22);
  draw(data?.berichtNr, header.berichtNr.x, header.berichtNr.y, 11, 22);

  const wt = Array.isArray(data?.workTimeRows) ? data.workTimeRows : [];
  const pauses = Array.isArray(data?.breakRows) ? data.breakRows : [];
  draw(wt[0]?.from, header.zeitVon.x, header.zeitVon.y, 10, 8);
  draw(wt[0]?.to, header.zeitBis.x, header.zeitBis.y, 10, 8);
  draw(pauses[0]?.from, header.pauseVon.x, header.pauseVon.y, 9, 8);
  draw(pauses[0]?.to, header.pauseBis.x, header.pauseBis.y, 9, 8);

  draw(data?.bohrrichtung, header.bohrrichtung.x, header.bohrrichtung.y, 10, 36);
  draw(data?.winkelHorizontal, header.winkelHorizontal.x, header.winkelHorizontal.y, 10, 10);
  draw(data?.winkelNord, header.winkelNord.x, header.winkelNord.y, 10, 10);

  draw(data?.ruhewasserVorArbeitsbeginnM, header.wasserspiegelAbGok.x, header.wasserspiegelAbGok.y, 10, 10);
  draw(data?.verrohrungAbGok ?? data?.tableRows?.[0]?.verrohrtVon, header.verrohrungAbGok.x, header.verrohrungAbGok.y, 10, 10);
  draw(data?.weather?.tempMaxC, header.temperatur.x, header.temperatur.y, 10, 8);
  const weatherLabel = Array.isArray(data?.weather?.conditions)
    ? data.weather.conditions.join("/")
    : data?.weather;
  draw(weatherLabel, header.wetter.x, header.wetter.y, 9, 20);

  draw(data?.workers?.[0]?.name, header.bohrmeister.x, header.bohrmeister.y, 10, 18);
  draw(data?.vehicles ?? data?.geraete, header.geraete.x, header.geraete.y, 9, 22);
  draw(data?.workers?.[1]?.name, header.bohrhelfer.x, header.bohrhelfer.y, 10, 18);

  // Wochentag markieren
  const weekdayX = { mo: 398, di: 428, mi: 459, do: 490, fr: 520, sa: 550, so: 580 };
  const weekdayY = 787;
  const weekday = getWeekdayFromDate(String(data?.date ?? ""));
  if (weekday === 1) drawX(weekdayX.mo, weekdayY);
  if (weekday === 2) drawX(weekdayX.di, weekdayY);
  if (weekday === 3) drawX(weekdayX.mi, weekdayY);
  if (weekday === 4) drawX(weekdayX.do, weekdayY);
  if (weekday === 5) drawX(weekdayX.fr, weekdayY);
  if (weekday === 6) drawX(weekdayX.sa, weekdayY);
  if (weekday === 0) drawX(weekdayX.so, weekdayY);

  // Haupttabelle (oben Mitte)
  const rows = Array.isArray(data?.tableRows) ? data.tableRows : [];
  const tableYStart = 470;
  const tableYStep = 31;
  const tableCols = {
    aufschluss: 34,
    krone: 114,
    tiefeVon: 206,
    tiefeBis: 286,
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

    draw(r?.verrohrtFlags?.join("/") || "Spülung", tableCols.aufschluss, y, 9, 14);
    draw(r?.boNr, tableCols.krone, y, 9, 12);
    draw(r?.gebohrtVon, tableCols.tiefeVon, y, 9, 8);
    draw(r?.gebohrtBis, tableCols.tiefeBis, y, 9, 8);
    draw(r?.indivProbe ?? "", tableCols.beschreibung, y, 8, 62);
    draw(r?.hindernisZeit ?? "", tableCols.besonderheiten, y, 8, 16);
  }

  // Ausbau / Verfüllung / SPT-Versuche (unten)
  const pegelRows = Array.isArray(data?.pegelAusbauRows) ? data.pegelAusbauRows : [];
  const lowerYStart = 292;
  const lowerYStep = 24;
  const lowerCols = {
    ausbauVon: 52,
    ausbauBis: 130,
    ausbauRohr: 214,
    verfVon: 352,
    verfBis: 428,
    verfMaterial: 505,
    sptVon: 646,
    sptBis: 689,
    sptA: 730,
    sptB: 760,
    sptC: 791,
  } as const;
  for (let i = 0; i < Math.min(10, pegelRows.length); i++) {
    const p = pegelRows[i] ?? {};
    const rowHasValue = Object.values(p).some((v) => {
      if (typeof v === "boolean") return v;
      return String(v ?? "").trim() !== "";
    });
    if (!rowHasValue) continue;
    const y = lowerYStart - i * lowerYStep;

    draw(p?.filterVon, lowerCols.ausbauVon, y, 9, 8);
    draw(p?.filterBis, lowerCols.ausbauBis, y, 9, 8);
    draw(p?.pegelDm, lowerCols.ausbauRohr, y, 9, 14);

    draw(p?.tonVon, lowerCols.verfVon, y, 9, 8);
    draw(p?.tonBis, lowerCols.verfBis, y, 9, 8);
    draw(p?.tonBis || p?.filterkiesKoernung, lowerCols.verfMaterial, y, 9, 14);

    const s = rows[i]?.spt ? String(rows[i].spt).split("/") : [];
    draw(rows[i]?.gebohrtVon, lowerCols.sptVon, y, 9, 8);
    draw(rows[i]?.gebohrtBis, lowerCols.sptBis, y, 9, 8);
    draw(s[0], lowerCols.sptA, y, 9, 6);
    draw(s[1], lowerCols.sptB, y, 9, 6);
    draw(s[2], lowerCols.sptC, y, 9, 6);
  }

  // Footer-Bereiche
  draw(data?.besucher, 160, 112, 10, 96);
  draw(data?.sheVorfaelle, 160, 74, 10, 96);
  draw(data?.toolBoxTalks, 160, 36, 10, 96);
  draw(data?.taeglicheUeberpruefungBg, 160, 0, 10, 96);

  draw(data?.signatures?.drillerName, 30, -45, 10, 28);
  draw(data?.signatures?.clientOrManagerName, 390, -45, 10, 36);

  return pdf.save();
}
