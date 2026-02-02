import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

function getWeekdayFromDate(dateStr: string): number {
      // dateStr = "YYYY-MM-DD"
      // "T00:00:00" verhindert Timezone-Shift
      const d = new Date(dateStr + "T00:00:00");
      return d.getDay(); // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
    }

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const templatePath = path.join(process.cwd(), "public", "templates", "tagesbericht_template.pdf");
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "Template PDF not found", templatePath }, { status: 500 });
    }

    const templateBytes = fs.readFileSync(templatePath);
    const srcDoc = await PDFDocument.load(templateBytes);
    const srcPage = srcDoc.getPages()[0];
    try {
      const stat = fs.statSync(templatePath);
      console.log("[PREVIEW tpl]", {
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

    const drawWrapped = (text: string, x: number, y: number, maxWidth: number, opts?: { size?: number; lineHeight?: number; maxLines?: number }) => {
      const size = opts?.size ?? 10;
      const lineHeight = opts?.lineHeight ?? 10;
      const maxLines = opts?.maxLines ?? 2;
      const raw = (text ?? "").toString().trim();
      if (!raw) return;

      const words = raw.split(/\s+/);
      const lines: string[] = [];
      let current = "";

      for (const w of words) {
        const next = current ? `${current} ${w}` : w;
        const width = font.widthOfTextAtSize(next, size);
        if (width <= maxWidth || !current) {
          current = next;
        } else {
          lines.push(current);
          current = w;
          if (lines.length >= maxLines) break;
        }
      }
      if (lines.length < maxLines && current) lines.push(current);

      lines.slice(0, maxLines).forEach((line, i) => {
        draw(line, x, y - i * lineHeight, size);
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
    draw(data.project ?? "", 155, outH - 58, 10);
    draw(data.client ?? "", 155, outH - 81, 10);

    // Fahrzeuge: Umbruch bei zu langem Text
    drawWrapped(String(data.vehicles ?? ""), 417, outH - 67, 70, { size: 9, lineHeight: 9, maxLines: 3 });
    draw(String(data.aNr ?? ""), 483, outH - 68, 9);
    draw(String(data.device ?? ""), 483, outH - 86, 8);

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

  // Wetter: nur Kreuze, KEIN Text
    const conditions: string[] = Array.isArray(data.weather?.conditions) ? data.weather.conditions : [];

    const WX = {
      trocken: { x: 610, y: outH - 105 },
      regen: { x: 640, y: outH - 105 },
      frost: { x: 670, y: outH - 105 },
    };

    const mark = (x: number, y: number) => draw("X", x, y, 12);

    if (conditions.includes("trocken")) mark(WX.trocken.x, WX.trocken.y);
    if (conditions.includes("regen")) mark(WX.regen.x, WX.regen.y);
    if (conditions.includes("frost")) mark(WX.frost.x, WX.frost.y);

    draw(data.weather?.tempMaxC != null ? String(data.weather.tempMaxC) : "", 735, outH - 104, 9);
    draw(data.weather?.tempMinC != null ? String(data.weather.tempMinC) : "", 785, outH - 104, 9);

    // ===== TRANSPORT (ausklappbar) =====
    // erwartet: data.transportRows = [{from,to,km,time}, ...]
    const transportRows = Array.isArray(data.transportRows) ? data.transportRows : [];

    // Koordinaten = deine alte Transport-Zeile
    const transportStartY = outH - 130; // passt zu deinem Layout
    const transportRowH = 15;           // Abstand zwischen Zeilen (feinjustieren)

    const TCOL = {
      from: 590,
      to: 685,
      km: 750,
      time: 792,
    };

    // zeichne max 2 Zeilen (bei Bedarf auf 3 erhöhen)
    transportRows.slice(0, 2).forEach((r: any, i: number) => {
      const y = transportStartY - i * transportRowH;
      draw(String(r.from ?? ""), TCOL.from, y, 9);
      draw(String(r.to ?? ""), TCOL.to, y, 9);
      draw(r.km != null ? String(r.km) : "", TCOL.km, y, 9);
      draw(String(r.time ?? ""), TCOL.time, y, 9);
    });

    draw(data.ruhewasserVorArbeitsbeginnM != null ? String(data.ruhewasserVorArbeitsbeginnM) : "", 630, outH - 165, 9);
    draw(data.entfernungWohnwagenBaustelleKm != null ? String(data.entfernungWohnwagenBaustelleKm) : "", 755, outH - 167, 9);

    // ❗ BUGFIX: bei dir war x=79 -> viel zu weit links
    draw(String(data.entfernungWohnwagenBaustelleZeit ?? ""), 790, outH - 167, 9);

    // ===== Arbeiter-Block (zwischen Kopf und Tabelle) =====
    const workers = Array.isArray(data.workers) ? data.workers : [];

    const workersStartY = outH - 120;
    const workerRowH = 18;

    const ws = (v: any, max = 30) => (v == null ? "" : String(v)).slice(0, max);

    const STUNDEN_BOXES = 15;

    const WCOL = {
      name: 30,
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
    const tableStartY = outH - 215;
    const rowH = 18;

    const rows = Array.isArray(data.tableRows) ? data.tableRows : [];

    const COL = {
      boNr: 26,
      gebohrtVon: 51,
      gebohrtBis: 72,
      verrohrtVon: 95,
      verrohrtBis: 115,
      rb: 148,
      ek: 165,
      dk: 182,
      s: 205,

      vollbohrVon: 227,
      vollbohrBis: 247,

      hindernisVon: 274,
      hindernisBis: 295,
      hindernisZeit: 315,

      schachtenVon: 340,
      schachtenBis: 360,
      schachtenZeit: 381,

      gp: 407,
      kp: 428,
      sp: 449,
      wp: 475,
      bkb: 500,
      kkLv: 525,

      spt: 577,

      tonVon: 645,
      tonBis: 665,
      bohrgutVon: 685,
      bohrgutBis: 705,
      zementBentVon: 730,
      zementBentBis: 750,
      betonVon: 775,
      betonBis: 795,
    };

    const getProbenFlags = (row: any): string[] => {
      if (Array.isArray(row?.probenFlags)) return row.probenFlags;

      const p = row?.proben;
      if (!p || typeof p !== "object") return [];

      const isOn = (v: any) => v === true || v === "x" || v === "X" || v === "1" || v === 1 || v === "true";
      const flags: string[] = [];
      if (isOn(p.gp)) flags.push("GP");
      if (isOn(p.kp)) flags.push("KP");
      if (isOn(p.sp)) flags.push("SP");
      if (isOn(p.wp)) flags.push("WP");
      if (isOn(p.bkb)) flags.push("BKB");
      if (isOn(p.kkLv)) flags.push("KK-LV");
      return flags;
    };

    rows.slice(0, 5).forEach((row: any, i: number) => {
      const y = tableStartY - i * rowH;

      draw(t(row.boNr, 6), COL.boNr, y, 8);
      draw(t(row.gebohrtVon, 6), COL.gebohrtVon, y, 8);
      draw(t(row.gebohrtBis, 6), COL.gebohrtBis, y, 8);
      draw(t(row.verrohrtVon, 6), COL.verrohrtVon, y, 8);
      draw(t(row.verrohrtBis, 6), COL.verrohrtBis, y, 8);

      const vflags = Array.isArray(row.verrohrtFlags) ? row.verrohrtFlags : [];
      draw(vflags.includes("RB") ? "X" : "", COL.rb, y, 8);
      draw(vflags.includes("EK") ? "X" : "", COL.ek, y, 8);
      draw(vflags.includes("DK") ? "X" : "", COL.dk, y, 8);
      draw(vflags.includes("S") ? "X" : "", COL.s, y, 8);

      draw(t(row.vollbohrVon, 6), COL.vollbohrVon, y, 8);
      draw(t(row.vollbohrBis, 6), COL.vollbohrBis, y, 8);

      draw(t(row.hindernisVon, 6), COL.hindernisVon, y, 8);
      draw(t(row.hindernisBis, 6), COL.hindernisBis, y, 8);
      draw(t(row.hindernisZeit, 10), COL.hindernisZeit, y, 8);

      draw(t(row.schachtenVon, 6), COL.schachtenVon, y, 8);
      draw(t(row.schachtenBis, 6), COL.schachtenBis, y, 8);
      draw(t(row.schachtenZeit, 6), COL.schachtenZeit, y, 8);

      const pflags = getProbenFlags(row);
      draw(pflags.includes("GP") ? "X" : "", COL.gp, y, 8);
      draw(pflags.includes("KP") ? "X" : "", COL.kp, y, 8);
      draw(pflags.includes("SP") ? "X" : "", COL.sp, y, 8);
      draw(pflags.includes("WP") ? "X" : "", COL.wp, y, 8);
      draw(pflags.includes("BKB") ? "X" : "", COL.bkb, y, 8);
      draw(pflags.includes("KK-LV") ? "X" : "", COL.kkLv, y, 8);

      draw(t(row.versucheSpt ?? row.spt, 4), COL.spt, y, 8);

      const vf = row?.verfuellung ?? row ?? {};
      draw(t(vf.tonVon, 6), COL.tonVon, y, 8);
      draw(t(vf.tonBis, 6), COL.tonBis, y, 8);
      draw(t(vf.bohrgutVon, 6), COL.bohrgutVon, y, 8);
      draw(t(vf.bohrgutBis, 6), COL.bohrgutBis, y, 8);
      draw(t(vf.zementBentVon, 6), COL.zementBentVon, y, 8);
      draw(t(vf.zementBentBis, 6), COL.zementBentBis, y, 8);
      draw(t(vf.betonVon, 6), COL.betonVon, y, 8);
      draw(t(vf.betonBis, 6), COL.betonBis, y, 8);
    });

    // ===== UMSETZEN =====
    const umsetzen = Array.isArray(data.umsetzenRows) ? data.umsetzenRows : [];

    // Start-Y muss die ERSTE Datenzeile treffen (nicht die Überschrift)
    const umsetzenStartY = 284;     // ggf. minimal anpassen
    const umsetzenRowH = 18;

    // ✅ Wichtig: Begründung/Wartezeit gehören optisch in die "zweite Zeile" der Zelle
    const REASON_LINE_OFFSET = 8;   // <- feinjustieren (6–10 typisch)

    const UCOL = {
      von: 60,
      auf: 135,
      entfernungM: 255,
      zeit: 293,
      begruendung: 375,
      wartezeit: 475,
    };

    umsetzen.slice(0, 5).forEach((r: any, i: number) => {
      const y = umsetzenStartY - i * umsetzenRowH;

      // erste Zeile (von/auf/entfernung/zeit)
      draw(t(r.von, 18), UCOL.von, y + 6, 8);
      draw(t(r.auf, 18), UCOL.auf, y + 6, 8);
      draw(t(r.entfernungM, 6), UCOL.entfernungM, y + 7, 8);
      draw(t(r.zeit, 10), UCOL.zeit, y + 7, 8);

      // zweite Zeile (Begründung/Wartezeit) -> nur für die ersten 4 Zeilen
      if (i < 4) {
        const y2 = y - REASON_LINE_OFFSET;
        draw(t(r.begruendung, 30), UCOL.begruendung, y2, 8);
        draw(t(r.wartezeit, 30), UCOL.wartezeit, y2, 8);
      }

      // Option B (wenn du willst): nur wenn Text vorhanden
      // if ((r.begruendung ?? "").trim()) draw(t(r.begruendung, 30), UCOL.begruendung, y2, 8);
      // if ((r.wartezeit ?? "").trim()) draw(t(r.wartezeit, 30), UCOL.wartezeit, y2, 8);
    });

    // ===== PEGELAUSBAU (NEU) =====
    const pegelRows = Array.isArray(data.pegelAusbauRows) ? data.pegelAusbauRows : [];

    // ✅ Y Start: hier feinjustieren, bis es exakt im Raster sitzt
    const pegelStartY = 168; // <- ggf. anpassen
    const pegelRowH = 16;

    const PCOL = {
      bohrNr: 40,
      pegelDm: 60,

      // ROHRE
      sumpfVon: 95,
      sumpfBis: 120,
      filterVon: 145,
      filterBis: 170,
      aufsatzPvcVon: 205,
      aufsatzPvcBis: 225,
      aufsatzStahlVon: 250,
      aufsatzStahlBis: 275,
      filterkiesVon: 305,
      filterkiesBis: 330,

      // DICHTUNG / VERFÜLLUNG
      tonVon: 360,
      tonBis: 385,
      sandVon: 410,
      sandBis: 440,
      zementBentVon: 465,
      zementBentBis: 495,
      bohrgutVon: 520,
      bohrgutBis: 545,

      // VERSCHLÜSSE
      sebaKap: 580,
      boKap: 605,
      hydrKap: 635,
      fernGask: 660,
      passavant: 690,
      betonSockel: 715,
      abstHalter: 740,
      klarpump: 760,
    };

    pegelRows.slice(0, 3).forEach((r: any, i: number) => {
      const y = pegelStartY - i * pegelRowH;

      draw(t(r.bohrNr, 6), PCOL.bohrNr, y, 8);
      draw(t(r.pegelDm, 6), PCOL.pegelDm, y, 8);

      draw(t(r.sumpfVon, 6), PCOL.sumpfVon, y, 8);
      draw(t(r.sumpfBis, 6), PCOL.sumpfBis, y, 8);
      draw(t(r.filterVon, 6), PCOL.filterVon, y, 8);
      draw(t(r.filterBis, 6), PCOL.filterBis, y, 8);

      draw(t(r.aufsatzPvcVon, 6), PCOL.aufsatzPvcVon, y, 8);
      draw(t(r.aufsatzPvcBis, 6), PCOL.aufsatzPvcBis, y, 8);

      draw(t(r.aufsatzStahlVon, 6), PCOL.aufsatzStahlVon, y, 8);
      draw(t(r.aufsatzStahlBis, 6), PCOL.aufsatzStahlBis, y, 8);

      draw(t(r.filterkiesVon, 6), PCOL.filterkiesVon, y, 8);
      draw(t(r.filterkiesBis, 6), PCOL.filterkiesBis, y, 8);

      draw(t(r.tonVon, 6), PCOL.tonVon, y, 8);
      draw(t(r.tonBis, 6), PCOL.tonBis, y, 8);

      draw(t(r.sandVon, 6), PCOL.sandVon, y, 8);
      draw(t(r.sandBis, 6), PCOL.sandBis, y, 8);

      draw(t(r.zementBentVon, 6), PCOL.zementBentVon, y, 8);
      draw(t(r.zementBentBis, 6), PCOL.zementBentBis, y, 8);

      draw(t(r.bohrgutVon, 6), PCOL.bohrgutVon, y, 8);
      draw(t(r.bohrgutBis, 6), PCOL.bohrgutBis, y, 8);

      const y0 = pegelStartY - i * pegelRowH;

      if (r.sebaKap) draw("X", PCOL.sebaKap, y0 -3 , 10);
      if (r.boKap) draw("X", PCOL.boKap, y0 -3, 10);
      if (r.hydrKap) draw("X", PCOL.hydrKap, y0 -3, 10);
      if (r.fernGask) draw("X", PCOL.fernGask, y0 -3, 10);
      if (r.passavant) draw("X", PCOL.passavant, y0 -4, 10);
      if (r.betonSockel) draw("X", PCOL.betonSockel, y0 -4, 10);
      if (r.abstHalter) draw("X", PCOL.abstHalter, y0 -4, 10);
      if (r.klarpump) draw("X", PCOL.klarpump, y0 -5, 10);
    });

    // ===== UNTERER BEREICH: Sonstige Arbeiten / Bemerkungen / Unterschriften =====

    // Multiline helper (einfach + robust)
    const drawMultiline = (text: string, x: number, y: number, options?: { size?: number; lineHeight?: number; maxLines?: number; maxCharsPerLine?: number }) => {
      const size = options?.size ?? 9;
      const lineHeight = options?.lineHeight ?? 12;
      const maxLines = options?.maxLines ?? 6;
      const maxCharsPerLine = options?.maxCharsPerLine ?? 60;

      const raw = (text ?? "").toString().replace(/\r/g, "");
      if (!raw.trim()) return;

      // primitive wrapping: harte Zeichenanzahl pro Zeile
      const words = raw.split(/\s+/);
      const lines: string[] = [];
      let cur = "";

      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxCharsPerLine) {
          if (cur) lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
        if (lines.length >= maxLines) break;
      }
      if (lines.length < maxLines && cur) lines.push(cur);

      lines.slice(0, maxLines).forEach((ln, i) => draw(ln, x, y - i * lineHeight, size));
    };

    // ✅ Koordinaten: bitte danach von dir feinjustieren
    // (outH ist oben, je kleiner y desto weiter unten)
    const BOTTOM = {
      // linkes Textfeld "Sonstige Arbeiten"
      otherWorkX: 20,
      otherWorkY: 103, // Start oben im Feld
      otherWorkMaxLines: 5,

      // mittleres Textfeld "Bemerkungen—Anordnungen—Besuche"
      remarksX: 250,
      remarksY: 103,
      remarksMaxLines: 5,

      // rechts: Unterschriftenbereich (Namen)
      sigClientNameX: 740,
      sigClientNameY: 120, // oberes Unterschrift-Feld
      sigDrillerNameX: 740,
      sigDrillerNameY: 70,  // unteres Unterschrift-Feld
    };

    // Sonstige Arbeiten (data.otherWork)
    drawMultiline(String(data.otherWork ?? ""), BOTTOM.otherWorkX, BOTTOM.otherWorkY, {
      size: 9,
      lineHeight: 15,
      maxLines: BOTTOM.otherWorkMaxLines,
      maxCharsPerLine: 52,
    });

    // Bemerkungen / Anordnungen / Besuche (data.remarks)
    drawMultiline(String(data.remarks ?? ""), BOTTOM.remarksX, BOTTOM.remarksY, {
      size: 9,
      lineHeight: 15,
      maxLines: BOTTOM.remarksMaxLines,
      maxCharsPerLine: 50,
    });

    // Unterschriften: keine Namen drucken

    // ===== SIGNATURE IMAGES (PNG Base64) =====

// --- Bohrmeister Signatur ---
    const drillerSig = data?.signatures?.drillerSigPng;

    if (typeof drillerSig === "string" && drillerSig.startsWith("data:image/png;base64,")) {
      const base64 = drillerSig.split(",")[1];
      const pngBytes = Buffer.from(base64, "base64");
      const pngImage = await outDoc.embedPng(pngBytes);

      // TODO: Koordinaten feinjustieren
      page.drawImage(pngImage, {
        x: 480,   // <- anpassen
        y: 34,    // <- anpassen
        width: 120,
        height: 40,
      });
    }

    // --- Auftraggeber / Bauleitung Signatur ---
    const clientSig = data?.signatures?.clientOrManagerSigPng;

    if (typeof clientSig === "string" && clientSig.startsWith("data:image/png;base64,")) {
      const base64 = clientSig.split(",")[1];
      const pngBytes = Buffer.from(base64, "base64");
      const pngImage = await outDoc.embedPng(pngBytes);

      page.drawImage(pngImage, {
        x: 480,  // <- anpassen
        y: 90,   // <- anpassen
        width: 120,
        height: 40,
      });
    }

    const outBytes = await outDoc.save();
    const body = Buffer.from(outBytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="tagesbericht_landscape.pdf"',
      },
    });
  } catch (err: any) {
    console.error("PDF route error:", err);
    return NextResponse.json({ error: "PDF generation failed", message: err?.message ?? String(err) }, { status: 500 });
  }
}
