import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

type GenerateOptions = {
  debugGrid?: boolean;
  debugGridStep?: number;
  markers?: Array<{
    page: number;
    x: number;
    y: number;
    text?: string;
    size?: number;
  }>;
};

const TEMPLATE_FILES = ["SV_1.pdf", "SV_2.pdf"] as const;

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

  const pages: Array<ReturnType<typeof outDoc.addPage>> = [];

  for (const fileName of TEMPLATE_FILES) {
    const templatePath = getTemplatePath(fileName);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template PDF not found at: ${templatePath}`);
    }

    const templateBytes = fs.readFileSync(templatePath);
    const srcDoc = await PDFDocument.load(templateBytes);
    const [page] = await outDoc.copyPages(srcDoc, [0]);
    outDoc.addPage(page);
    pages.push(page);
  }

  if (options.debugGrid) {
    const step = options.debugGridStep ?? 50;
    pages.forEach((page) => drawGrid(page, font, step));
  }

  if (options.markers && options.markers.length) {
    options.markers.forEach((marker) => {
      const page = pages[Math.max(0, Math.min(pages.length - 1, marker.page - 1))];
      if (!page) return;
      drawMarker(page, font, marker);
    });
  }

  // Mapping folgt: Felder -> Koordinaten pro Seite
  // data ist bereits komplett verfügbar (JSON aus Form/DB).

  return outDoc.save();
}
