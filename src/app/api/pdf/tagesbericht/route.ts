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

    const wrapLines = (text: string, options?: { maxLines?: number; maxCharsPerLine?: number }) => {
      const maxLines = options?.maxLines ?? 6;
      const maxCharsPerLine = options?.maxCharsPerLine ?? 60;
      const raw = (text ?? "").toString().replace(/\r/g, "");
      if (!raw.trim()) return [] as string[];

      const lines: string[] = [];
      const paragraphs = raw.split("\n");
      for (const para of paragraphs) {
        if (lines.length >= maxLines) break;
        const trimmed = para.trim();
        if (!trimmed) {
          lines.push("");
          continue;
        }
        const words = trimmed.split(/\s+/);
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
      }
      return lines.slice(0, maxLines);
    };

    const drawMultiline = (text: string, x: number, y: number, options?: { size?: number; lineHeight?: number; maxLines?: number; maxCharsPerLine?: number }) => {
      const size = options?.size ?? 9;
      const lineHeight = options?.lineHeight ?? 12;
      const lines = wrapLines(text, options);
      lines.forEach((ln, i) => draw(ln, x, y - i * lineHeight, size));
    };

    const drawMultilineAuto = (text: string, x: number, y: number, opts?: { maxLines?: number; maxCharsPerLine?: number; size?: number; lineHeight?: number; smallSize?: number; smallLineHeight?: number }) => {
      const hasSecondLine = (text ?? "").toString().includes("\n");
      const size = hasSecondLine ? (opts?.smallSize ?? 6) : (opts?.size ?? 8);
      const lineHeight = hasSecondLine ? (opts?.smallLineHeight ?? 6) : (opts?.lineHeight ?? 8);
      drawMultiline(text, x, y, {
        size,
        lineHeight,
        maxLines: opts?.maxLines ?? 2,
        maxCharsPerLine: opts?.maxCharsPerLine ?? 6,
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

    // Kopfzeile: Arbeitstakte Nr. (aus Auswahl) über den Stundenkästchen
    const stundenHeaderY = workersStartY + 12;
    const workCycleOptions = [
      "Transport",
      "Einrichten und Aufstellen",
      "Umsetzen",
      "Rammbohren/EK-bohren",
      "Kernbohren",
      "Vollbohren",
      "Hindernisse durchbohren",
      "Schachten",
      "Proben/Bohrung aufnehmen",
      "Bo. aufnehmen m. GA",
      "Pumpversuche",
      "Bohrloch Versuche",
      "Bohrloch Verfüllung",
      "Pegel:einbau mit Verfüllung",
      "Fahrten",
      "Bohrstelle räumen, Flurschäden beseitigen",
      "Baustelle räumen",
      "Werkstatt/Laden",
      "Geräte-Pflege/Reparatur",
      "Kampfmittel",
      "Wasser fahren",
      "Platten legen",
    ];
    const workCycles = Array.isArray(data.workCycles) ? data.workCycles : [];
    const customCycleOrder: string[] = [];
    const customCycleSeen = new Set<string>();
    workCycles.forEach((label: string) => {
      if (!label) return;
      if (workCycleOptions.includes(label)) return;
      if (customCycleSeen.has(label)) return;
      customCycleSeen.add(label);
      customCycleOrder.push(label);
    });
    const customCycleIndex = new Map<string, number>(
      customCycleOrder.map((label, idx) => [label, idx])
    );
    for (let j = 0; j < STUNDEN_BOXES; j++) {
      const label = workCycles[j];
      const idx = label ? workCycleOptions.indexOf(label) : -1;
      const customIdx = label ? customCycleIndex.get(label) : undefined;
      const display =
        idx >= 0
          ? String(idx + 1)
          : typeof customIdx === "number"
          ? String(23 + customIdx)
          : "";
      draw(display, WCOL.stundenStartX + j * WCOL.stundenStep, stundenHeaderY, 8);
    }

    // Markierung der gewählten Arbeitstakte in der Liste rechts
    const selectedCycles = new Set<number>();
    workCycles.forEach((label: string) => {
      const idx = workCycleOptions.indexOf(label);
      if (idx >= 0) {
        selectedCycles.add(idx + 1);
      }
    });

    const LIST = {
      leftX: 595,
      rightX: 705,
      startY: 292,
      rowH: 8.5,
      boxW: 100,
      boxH: 10,
    };

    selectedCycles.forEach((nr) => {
      const col = nr <= 10 ? 0 : 1;
      const row = nr <= 10 ? nr - 1 : nr - 11;
      const x = col === 0 ? LIST.leftX : LIST.rightX;
      const y = LIST.startY - row * LIST.rowH;
      page.drawRectangle({
        x,
        y,
        width: LIST.boxW,
        height: LIST.boxH,
        color: rgb(0.2, 0.6, 1),
        opacity: 0.25,
      });
    });

    // Eigene Takte (20+) haben keine feste Position in der gedruckten Liste,
    // daher hier keine Markierung setzen.

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
        draw(String(val ?? ""), WCOL.stundenStartX + j * WCOL.stundenStep, y, 8);
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
      rb: 140,
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
      indivProbe: 542,

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

    // Überschrift für individuelle Probe (neben KK/LV)
    // draw("Indiv. Probe", COL.indivProbe - 4, tableStartY + 17, 5);

    draw("Indiv.", COL.indivProbe - 4, tableStartY + 17, 6);
    draw("Probe",  COL.indivProbe - 4, tableStartY + 12, 6);


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

      const toNum = (v: any) => {
        if (v == null) return null;
        const n = Number(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      const gebohrtVon = toNum(row.gebohrtVon);
      const gebohrtBis = toNum(row.gebohrtBis);
      const diff = gebohrtVon != null && gebohrtBis != null && gebohrtBis >= gebohrtVon ? gebohrtBis - gebohrtVon : null;
      const diffStr = diff == null ? "" : (Math.round(diff * 10) / 10).toString();

      const verrohrtDurchm = String(row.verrohrtBis ?? "");
      const rbSet = new Set(["178", "220", "273", "324", "368", "419", "509"]);
      if (verrohrtDurchm === "146") {
        draw(diffStr, COL.s, y, 8);
      } else if (rbSet.has(verrohrtDurchm)) {
        draw(diffStr, COL.rb, y, 8);
      }

      draw(t(row.vollbohrVon, 6), COL.vollbohrVon, y, 8);
      draw(t(row.vollbohrBis, 6), COL.vollbohrBis, y, 8);

      draw(t(row.hindernisVon, 6), COL.hindernisVon, y, 8);
      draw(t(row.hindernisBis, 6), COL.hindernisBis, y, 8);
      draw(t(row.hindernisZeit, 10), COL.hindernisZeit, y, 8);

      draw(t(row.schachtenVon, 6), COL.schachtenVon, y, 8);
      draw(t(row.schachtenBis, 6), COL.schachtenBis, y, 8);
      draw(t(row.schachtenZeit, 6), COL.schachtenZeit, y, 8);

      const pvals = (row?.probenValues ?? {}) as Record<string, string>;
      const pflags = getProbenFlags(row);
      draw(t(pvals.GP ?? (pflags.includes("GP") ? "X" : ""), 4), COL.gp, y, 8);
      draw(t(pvals.KP ?? (pflags.includes("KP") ? "X" : ""), 4), COL.kp, y, 8);
      draw(t(pvals.SP ?? (pflags.includes("SP") ? "X" : ""), 4), COL.sp, y, 8);
      draw(t(pvals.WP ?? (pflags.includes("WP") ? "X" : ""), 4), COL.wp, y, 8);
      draw(t(pvals.BKB ?? (pflags.includes("BKB") ? "X" : ""), 4), COL.bkb, y, 8);
      draw(t(pvals["KK-LV"] ?? (pflags.includes("KK-LV") ? "X" : ""), 4), COL.kkLv, y, 8);

      draw(t(row.indivProbe, 6), COL.indivProbe, y, 8);
      draw(t(row.versucheSpt ?? row.spt, 4), COL.spt, y, 8);

      const vf = row?.verfuellung ?? row ?? {};
      drawMultilineAuto(String(vf.tonVon ?? ""), COL.tonVon, y + 3);
      drawMultilineAuto(String(vf.tonBis ?? ""), COL.tonBis, y + 3);
      drawMultilineAuto(String(vf.bohrgutVon ?? ""), COL.bohrgutVon, y + 3);
      drawMultilineAuto(String(vf.bohrgutBis ?? ""), COL.bohrgutBis, y + 3);
      draw(t(vf.zementBentVon, 6), COL.zementBentVon, y, 8);
      draw(t(vf.zementBentBis, 6), COL.zementBentBis, y, 8);
      draw(t(vf.betonVon, 6), COL.betonVon, y, 8);
      draw(t(vf.betonBis, 6), COL.betonBis, y, 8);
    });

    // ===== UMSETZEN =====
    const umsetzen = Array.isArray(data.umsetzenRows) ? data.umsetzenRows : [];

    // Start-Y muss die ERSTE Datenzeile treffen (nicht die Überschrift)
    const umsetzenRowH = 18;
    const umsetzenStartY = 284 - umsetzenRowH;     // in Zeile 2 starten

    // ✅ Begründung/Wartezeit auf gleicher Höhe wie die erste Zeile
    const REASON_LINE_OFFSET = 0;

    const UCOL = {
      von: 60,
      auf: 135,
      entfernungM: 255,
      zeit: 293,
      begruendung: 375,
      wartezeit: 475,
    };

    umsetzen.slice(0, 3).forEach((r: any, i: number) => {
      const y = umsetzenStartY - i * umsetzenRowH;

      // erste Zeile (von/auf/entfernung/zeit)
      draw(t(r.von, 18), UCOL.von, y + 6, 8);
      draw(t(r.auf, 18), UCOL.auf, y + 6, 8);
      draw(t(r.entfernungM, 6), UCOL.entfernungM, y + 7, 8);
      draw(t(r.zeit, 10), UCOL.zeit, y + 7, 8);

      // Begründung/Wartezeit auf gleicher Zeile
      if (i < 4) {
        const y2 = y + 6 - REASON_LINE_OFFSET;
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
      filterkiesKoernung: 786,
    };

    // Header-Label für neues Feld
    const drawLabel = (text: string, x: number, y: number, size = 7, lineHeight = 6) => {
      const lines = wrapLines(text, { maxLines: 2, maxCharsPerLine: 12 });
      lines.forEach((ln, i) =>
        page.drawText(ln, {
          x,
          y: y - i * lineHeight,
          size,
          font,
          color: rgb(0, 0, 0),
          rotate: degrees(0),
        })
      );
    };

    drawLabel("Filterkies\nKörnung", PCOL.filterkiesKoernung, pegelStartY + 20);

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

      drawMultilineAuto(String(r.filterkiesVon ?? ""), PCOL.filterkiesVon, y + 3);
      drawMultilineAuto(String(r.filterkiesBis ?? ""), PCOL.filterkiesBis, y + 3);

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
      draw(t(typeof r.abstHalter === "string" ? r.abstHalter : "", 4), PCOL.abstHalter, y0, 8);
      if (r.klarpump) draw("X", PCOL.klarpump, y0 -5, 10);
      draw(t(r.filterkiesKoernung, 10), PCOL.filterkiesKoernung, y0, 8);
    });

    // ===== UNTERER BEREICH: Sonstige Arbeiten / Bemerkungen / Unterschriften =====

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

    // Bemerkungen / Anordnungen / Besuche (+ eigene Arbeitstakte)
    const baseRemarks = String(data.remarks ?? "");
    const customWithNumbers = customCycleOrder.map((label, idx) => `${23 + idx} - ${label}`);
    const remarksCombined =
      baseRemarks.trim() && customWithNumbers.length
        ? `${baseRemarks}\n\n${customWithNumbers.join("\n")}`
        : baseRemarks.trim()
          ? baseRemarks
          : customWithNumbers.join("\n");

    const remarkLines = wrapLines(remarksCombined, {
      maxLines: BOTTOM.remarksMaxLines,
      maxCharsPerLine: 50,
    });
    remarkLines.forEach((ln, i) => {
      if (/^\s*2\d\s*-\s*/.test(ln)) {
        const width = font.widthOfTextAtSize(ln, 9) + 4;
        page.drawRectangle({
          x: BOTTOM.remarksX - 2,
          y: BOTTOM.remarksY - i * 15 - 3,
          width,
          height: 11,
          color: rgb(0.2, 0.6, 1),
          opacity: 0.2,
        });
      }
    });
    remarkLines.forEach((ln, i) => draw(ln, BOTTOM.remarksX, BOTTOM.remarksY - i * 15, 9));

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
