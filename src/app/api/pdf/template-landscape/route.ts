import { NextResponse } from "next/server";
import { PDFDocument, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function GET() {
  const templatePath = path.join(process.cwd(), "public", "templates", "tagesbericht_template.pdf");
  const templateBytes = fs.readFileSync(templatePath);

  const srcDoc = await PDFDocument.load(templateBytes);

  // ✅ Neues Dokument
  const outDoc = await PDFDocument.create();

  // Source page einbetten
  const [srcPage] = srcDoc.getPages();
  const [embedded] = await outDoc.embedPages([srcPage]);

  // Querformat-Seite: wir nehmen einfach (height, width) des Originals
  const srcW = embedded.width;
  const srcH = embedded.height;

  // Landscape: Breite = srcH, Höhe = srcW
  const page = outDoc.addPage([srcH, srcW]);

  // Wir drehen die eingebettete Seite 90° und schieben sie korrekt rein:
  // rotate(90) braucht translate, sonst landet sie außerhalb
  page.drawPage(embedded, {
    x: srcH,     // translate X
    y: 0,
    rotate: degrees(90),
    xScale: 1,
    yScale: 1,
  });

  const bytes = await outDoc.save();

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="tagesbericht_template_landscape.pdf"',
    },
  });
}