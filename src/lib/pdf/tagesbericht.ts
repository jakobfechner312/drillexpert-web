// src/lib/pdf/tagesbericht.ts
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

function getWeekdayFromDate(dateStr: string): number {
  // dateStr = "YYYY-MM-DD"
  // "T00:00:00" verhindert Timezone-Shift
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay(); // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
}

function parseTimeToMinutes(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const hh = Number(digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2));
  const mm = Number(digits.length === 3 ? digits.slice(1, 3) : digits.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function calcDurationHours(from: unknown, to: unknown): string {
  const start = parseTimeToMinutes(from);
  const endBase = parseTimeToMinutes(to);
  if (start == null || endBase == null) return "";
  let end = endBase;
  if (end < start) end += 24 * 60;
  const minutes = end - start;
  if (minutes < 0) return "";
  return (minutes / 60).toFixed(2).replace(".", ",");
}

/**
 * Baut aus deinem JSON den Tagesbericht als PDF (quer gedreht) und gibt Bytes zurück.
 * => Muss exakt wie die Preview-Route rendern
 */
export async function generateTagesberichtPdf(data: any): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "templates", "tagesbericht_template.pdf");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template PDF not found at: ${templatePath}`);
  }

  const templateBytes = fs.readFileSync(templatePath);
  const srcDoc = await PDFDocument.load(templateBytes);
  const srcPage = srcDoc.getPages()[0];
  try {
    const stat = fs.statSync(templatePath);
    console.log("[SAVED tpl]", {
      path: templatePath,
      size: stat.size,
      mtime: stat.mtime?.toISOString?.() ?? String(stat.mtime),
      srcW: srcPage.getWidth(),
      srcH: srcPage.getHeight(),
    });
  } catch {}

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const [embedded] = await outDoc.embedPages([srcPage]);
  const srcH = embedded.height;
  const srcW = embedded.width;

  const page = outDoc.addPage([srcH, srcW]);
  const outW = page.getWidth();
  const outH = page.getHeight();

  page.drawPage(embedded, {
    x: outW,
    y: 0,
    rotate: degrees(90),
    xScale: 1,
    yScale: 1,
  });

  const draw = (text: string, x: number, y: number, size = 10) => {
    page.drawText(text ?? "", {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 1),
      rotate: degrees(0),
    });
  };

  // Helfer für sichere Strings
  const t = (v: any, max = 12) => (v == null ? "" : String(v)).slice(0, max);

  // ✅ Wochentag-Kästchen Koordinaten (bitte einmal feinjustieren)
  const WEEKDAY_BOX = {
    so: { x: 26,  y: outH - 85 },
    mo: { x: 40,  y: outH - 85 },
    di: { x: 52,  y: outH - 85 },
    mi: { x: 65, y: outH - 85 },
    do: { x: 78, y: outH - 85 },
    fr: { x: 90, y: outH - 85 },
    sa: { x: 102, y: outH - 85 },
  };

  // ===== Kopfbereich =====
  draw(data.date ?? "", 38, outH - 68, 10);
  draw(data.project ?? "", 160, outH - 58, 10);
  draw(data.client ?? "", 140, outH - 81, 10);

  draw(String(data.vehicles ?? ""), 417, outH - 70, 10);
  draw(String(data.aNr ?? ""), 530, outH - 58, 10);
  draw(String(data.device ?? ""), 515, outH - 85, 10);

  // ===== Arbeitszeit + Pausen (max 2 Zeilen) =====
  const workTimes = Array.isArray(data.workTimeRows) ? data.workTimeRows : [];
  const breaks = Array.isArray(data.breakRows) ? data.breakRows : [];

  // Diese Y ist deine erste Zeile (wie vorher)
  const TIME_START_Y = outH - 70;

  // Abstand zur zweiten Zeile (DAMIT stellst du Zeile 2 ein!)
  const TIME_ROW_H = 15;

  // X-Positionen (wie vorher)
  const WORK = { fromX: 595, toX: 645 };
  const BRK = { fromX: 735, toX: 785 };

  for (let i = 0; i < Math.min(2, workTimes.length); i++) {
    const y = TIME_START_Y - i * TIME_ROW_H;
    draw(String(workTimes[i]?.from ?? ""), WORK.fromX, y, 10);
    draw(String(workTimes[i]?.to ?? ""), WORK.toX, y, 10);
  }

  for (let i = 0; i < Math.min(2, breaks.length); i++) {
    const y = TIME_START_Y - i * TIME_ROW_H;
    draw(String(breaks[i]?.from ?? ""), BRK.fromX, y, 10);
    draw(String(breaks[i]?.to ?? ""), BRK.toX, y, 10);
  }

  // ✅ Wochentag automatisch ankreuzen
  const weekday = getWeekdayFromDate(data.date ?? "");
  const markX = (x: number, y: number) => draw("X", x, y, 12);

  switch (weekday) {
    case 1: markX(WEEKDAY_BOX.mo.x, WEEKDAY_BOX.mo.y); break; // Mo
    case 2: markX(WEEKDAY_BOX.di.x, WEEKDAY_BOX.di.y); break; // Di
    case 3: markX(WEEKDAY_BOX.mi.x, WEEKDAY_BOX.mi.y); break; // Mi
    case 4: markX(WEEKDAY_BOX.do.x, WEEKDAY_BOX.do.y); break; // Do
    case 5: markX(WEEKDAY_BOX.fr.x, WEEKDAY_BOX.fr.y); break; // Fr
    case 6: markX(WEEKDAY_BOX.sa.x, WEEKDAY_BOX.sa.y); break; // Sa
    case 0: markX(WEEKDAY_BOX.so.x, WEEKDAY_BOX.so.y); break; // So
  }

  // Wetter: farblich markieren (kein X)
  const conditions: string[] = Array.isArray(data.weather?.conditions) ? data.weather.conditions : [];

  const WX = {
    trocken: { x: 610, y: outH - 105 },
    regen: { x: 640, y: outH - 105 },
    frost: { x: 670, y: outH - 105 },
  };

  const mark = (x: number, y: number, width = 20) =>
    page.drawRectangle({
      x: x - 6,
      y: y - 2,
      width,
      height: 10,
      color: rgb(0.2, 0.6, 1),
      opacity: 0.25,
    });

  if (conditions.includes("trocken")) mark(WX.trocken.x, WX.trocken.y, 26);
  if (conditions.includes("regen")) mark(WX.regen.x, WX.regen.y, 20);
  if (conditions.includes("frost")) mark(WX.frost.x, WX.frost.y, 20);

  draw(data.weather?.tempMaxC != null ? String(data.weather.tempMaxC) : "", 735, outH - 103, 9);
  draw(data.weather?.tempMinC != null ? String(data.weather.tempMinC) : "", 780, outH - 103, 9);

  // ===== TRANSPORT =====
  const transportRows = Array.isArray(data.transportRows) ? data.transportRows : [];

  const transportStartY = outH - 130;
  const transportRowH = 15;

  const TCOL = { from: 590, to: 675, km: 750, time: 795 };

  transportRows.slice(0, 2).forEach((r: any, i: number) => {
    const y = transportStartY - i * transportRowH;
    draw(String(r.from ?? ""), TCOL.from, y, 9);
    draw(String(r.to ?? ""), TCOL.to, y, 9);
    draw(r.km != null ? String(r.km) : "", TCOL.km, y, 9);
    draw(String(r.time ?? ""), TCOL.time, y, 9);
  });

  draw(data.ruhewasserVorArbeitsbeginnM != null ? String(data.ruhewasserVorArbeitsbeginnM) : "", 630, outH - 165, 9);
  draw(data.entfernungWohnwagenBaustelleKm != null ? String(data.entfernungWohnwagenBaustelleKm) : "", 755, outH - 167, 9);
  draw(String(data.entfernungWohnwagenBaustelleZeit ?? ""), 790, outH - 167, 9);

  // ===== Arbeiter-Block =====
  const workers = Array.isArray(data.workers) ? data.workers : [];

  const workersStartY = outH - 120;
  const workerRowH = 18;

  const ws = (v: any, max = 30) => (v == null ? "" : String(v)).slice(0, max);
  const STUNDEN_BOXES = 15;

  const WCOL = {
    name: 38,
    reineArbeitsStd: 150,
    wochenendfahrt: 180,
    ausfallStd: 220,
    ausloeseT: 250,
    ausloeseN: 275,
    stundenStartX: 290,
    stundenStep: 18,
  };

  workers.slice(0, 3).forEach((w: any, i: number) => {
    const y = workersStartY - i * workerRowH;

    draw(ws(w.name, 22), WCOL.name, y, 9);
    draw(ws(w.reineArbeitsStd, 4), WCOL.reineArbeitsStd, y, 9);
    draw(ws(w.wochenendfahrt, 4), WCOL.wochenendfahrt, y, 9);
    draw(ws(w.ausfallStd, 4), WCOL.ausfallStd, y, 9);

    if (w.ausloeseT) draw("X", WCOL.ausloeseT, y, 10);
    if (w.ausloeseN) draw("X", WCOL.ausloeseN, y, 10);

    const st = Array.isArray(w.stunden) ? w.stunden : [];
    for (let j = 0; j < STUNDEN_BOXES; j++) {
      const val = st[j] ?? "";
      draw(String(val ?? ""), WCOL.stundenStartX + j * WCOL.stundenStep, y, 7);
    }
  });

  // ===== Tabelle =====
  const tableRows = Array.isArray(data.tableRows) ? data.tableRows : [];

  const tableStartY = outH - 245;
  const tableRowH = 22;
  const indivProbeHeaderY = tableStartY + 12;

  // Header-Ergänzung (neben KK/LV in der Proben-Sektion)
  draw("Indiv. Probe", 622, indivProbeHeaderY, 7);

  for (let i = 0; i < Math.min(5, tableRows.length); i++) {
    const r = tableRows[i] || {};
    const y = tableStartY - i * tableRowH;

    draw(String(r.boNr ?? ""), 40, y, 9);
    draw(String(r.gebohrtVon ?? ""), 80, y, 9);
    draw(String(r.gebohrtBis ?? ""), 115, y, 9);
    draw(String(r.verrohrtVon ?? ""), 150, y, 9);
    draw(String(r.verrohrtBis ?? ""), 185, y, 9);

    const verFlags = Array.isArray(r.verrohrtFlags) ? r.verrohrtFlags : [];
    if (verFlags.includes("RB")) draw("X", 215, y, 9);
    if (verFlags.includes("EK")) draw("X", 230, y, 9);
    if (verFlags.includes("DK")) draw("X", 245, y, 9);
    if (verFlags.includes("S")) draw("X", 260, y, 9);

    draw(String(r.vollbohrVon ?? ""), 290, y, 9);
    draw(String(r.vollbohrBis ?? ""), 325, y, 9);

    draw(String(r.hindernisVon ?? ""), 360, y, 9);
    draw(String(r.hindernisBis ?? ""), 395, y, 9);
    draw(String(r.hindernisZeit ?? ""), 430, y, 9);

    draw(String(r.schachtenVon ?? ""), 465, y, 9);
    draw(String(r.schachtenBis ?? ""), 500, y, 9);
    draw(String(r.schachtenZeit ?? ""), 535, y, 9);

    const pvals = (r.probenValues ?? {}) as Record<string, string>;
    const probenFlags = Array.isArray(r.probenFlags) ? r.probenFlags : [];
    draw(String(pvals.GP ?? (probenFlags.includes("GP") ? "X" : "")), 565, y, 9);
    draw(String(pvals.KP ?? (probenFlags.includes("KP") ? "X" : "")), 580, y, 9);
    draw(String(pvals.SP ?? (probenFlags.includes("SP") ? "X" : "")), 595, y, 9);
    draw(String(pvals.WP ?? (probenFlags.includes("WP") ? "X" : "")), 610, y, 9);
    draw(String(pvals.BKB ?? (probenFlags.includes("BKB") ? "X" : "")), 625, y, 9);
    draw(String(pvals["KK-LV"] ?? (probenFlags.includes("KK-LV") ? "X" : "")), 640, y, 9);
    draw(String(r.indivProbe ?? ""), 655, y, 9);
    draw(String(r.spt ?? ""), 670, y, 9);

    const v = r.verfuellung || {};
    draw(String(v.tonVon ?? ""), 670, y, 9);
    draw(String(v.tonBis ?? ""), 705, y, 9);
    draw(String(v.bohrgutVon ?? ""), 740, y, 9);
    draw(String(v.bohrgutBis ?? ""), 775, y, 9);
  }

  // ===== Zusammenfassung / Sonstiges =====
  draw(String(data.workCycles ?? ""), 40, outH - 370, 9);
  draw(String(data.otherWork ?? ""), 40, outH - 395, 9);
  draw(String(data.remarks ?? ""), 40, outH - 420, 9);

  // ===== Unterschriften =====
  draw(String(data.clientOrManagerName ?? ""), 120, outH - 470, 9);
  draw(String(data.drillerName ?? ""), 380, outH - 470, 9);

  const weekendWorkers = Array.isArray(data?.workers) ? data.workers : [];
  const weekendRows = weekendWorkers
    .map((w: any) => {
      const active = Boolean(w?.wochenendfahrtJa) || String(w?.wochenendfahrt ?? "").trim().length > 0;
      const from = String(w?.wochenendfahrtVon ?? "").trim();
      const to = String(w?.wochenendfahrtBis ?? "").trim();
      const duration = calcDurationHours(from, to) || String(w?.wochenendfahrt ?? "").trim();
      return {
        active,
        name: String(w?.name ?? "").trim(),
        from,
        to,
        duration,
      };
    })
    .filter((row: { active: boolean; from: string; to: string; duration: string }) => row.active && (row.from || row.to || row.duration));

  if (weekendRows.length > 0) {
    const extra = outDoc.addPage([srcH, srcW]);
    extra.drawPage(embedded, {
      x: outW,
      y: 0,
      rotate: degrees(90),
      xScale: 1,
      yScale: 1,
    });

    const drawExtra = (text: string, x: number, y: number, size = 10) => {
      extra.drawText(text ?? "", { x, y, size, font, color: rgb(0, 0, 1) });
    };

    drawExtra(String(data?.date ?? ""), 38, outH - 68, 10);

    const weekendWorkRows = weekendRows.slice(0, 2);
    const TIME_START_Y = outH - 70;
    const TIME_ROW_H = 15;
    const WORK = { fromX: 595, toX: 645 };
    weekendWorkRows.forEach((row: { from: string; to: string }, i: number) => {
      const y = TIME_START_Y - i * TIME_ROW_H;
      drawExtra(row.from, WORK.fromX, y, 10);
      drawExtra(row.to, WORK.toX, y, 10);
    });

    const workersStartY = outH - 120;
    const workerRowH = 18;
    const WCOL = {
      name: 38,
      wochenendfahrt: 180,
    };

    weekendRows.slice(0, 3).forEach((row: { name: string; duration: string }, i: number) => {
      const y = workersStartY - i * workerRowH;
      drawExtra(row.name, WCOL.name, y, 9);
      drawExtra(row.duration, WCOL.wochenendfahrt, y, 9);
    });
  }

  const outBytes = await outDoc.save();
  return outBytes;
}
