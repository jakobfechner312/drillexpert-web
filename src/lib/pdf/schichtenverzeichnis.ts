import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { SV_FIELDS } from "@/lib/pdf/schichtenverzeichnis.mapping";
import { DEFAULT_FIELD_OFFSETS_PAGE_1 } from "@/lib/pdf/schichtenverzeichnis.default-offsets";

type GenerateOptions = {
  debugGrid?: boolean;
  debugGridStep?: number;
  debugGridPage?: number;
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
    if (options.debugGridPage && options.debugGridPage >= 1) {
      const page = pages[Math.max(0, Math.min(pages.length - 1, options.debugGridPage - 1))];
      if (page) drawGrid(page, font, step);
    } else {
      pages.forEach((page) => drawGrid(page, font, step));
    }
  }

  if (options.markers && options.markers.length) {
    options.markers.forEach((marker) => {
      const page = pages[Math.max(0, Math.min(pages.length - 1, marker.page - 1))];
      if (!page) return;
      drawMarker(page, font, marker);
    });
  }

  const drawText = (pageIndex: number, text: string, x: number, y: number, size = 10) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawText(text ?? "", { x, y, size, font, color: rgb(0, 0.35, 0.9) });
  };

  const wrapText = (text: string, maxWidth: number, size: number) => {
    const words = text.replace(/\r/g, "").split(/\s+/);
    const lines: string[] = [];
    let current = "";

    const pushCurrent = () => {
      if (current) lines.push(current);
      current = "";
    };

    const splitLongWord = (word: string) => {
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) lines.push(chunk);
    };

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        current = next;
        continue;
      }

      if (current) pushCurrent();

      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        splitLongWord(word);
      } else {
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  const drawWrappedText = (
    pageIndex: number,
    text: string,
    x: number,
    yTop: number,
    maxWidth: number,
    maxHeight: number,
    size = 10
  ) => {
    const page = pages[pageIndex];
    if (!page) return;
    const lineHeight = Math.max(12, Math.round(size * 1.25));
    const fitEllipsis = (value: string) => {
      if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
      let trimmed = value;
      while (trimmed.length > 0 && font.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
        trimmed = trimmed.slice(0, -1);
      }
      return `${trimmed}…`;
    };
    const paragraphs = text.split("\n");
    const lines: string[] = [];

    paragraphs.forEach((para) => {
      if (!para.trim()) {
        lines.push("");
        return;
      }
      wrapText(para, maxWidth, size).forEach((ln) => lines.push(ln));
    });

    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const sliced = lines.slice(0, maxLines);
    if (lines.length > maxLines && sliced.length) {
      sliced[sliced.length - 1] = fitEllipsis(sliced[sliced.length - 1]);
    }
    sliced.forEach((ln, idx) => {
      page.drawText(ln, {
        x,
        y: yTop - idx * lineHeight,
        size,
        font,
        color: rgb(0, 0.35, 0.9),
      });
    });
  };

  const fieldMap = new Map(SV_FIELDS.map((f) => [f.key, f]));
  const fieldOffsetsPage1 =
    (data?.field_offsets_page_1 as Record<string, { x?: number | string; y?: number | string }>) ||
    {};
  const rowFieldOffsetsPage1 =
    (data?.schicht_row_field_offsets_page_1 as Record<
      string,
      Record<string, { x?: number | string; y?: number | string }>
    >) || {};
  const getPage1FieldOffset = (fieldKey: string, axis: "x" | "y") => {
    const hasCustom = fieldOffsetsPage1?.[fieldKey]?.[axis] != null;
    if (hasCustom) {
      return Number(fieldOffsetsPage1[fieldKey][axis]) || 0;
    }
    return DEFAULT_FIELD_OFFSETS_PAGE_1[fieldKey]?.[axis] ?? 0;
  };
  const getRowFieldOffsetPage1 = (rowIndex: number, fieldKey: string, axis: "x" | "y") => {
    const raw = rowFieldOffsetsPage1?.[String(rowIndex)]?.[fieldKey]?.[axis];
    return Number(raw) || 0;
  };
  const hasRowData = Array.isArray(data?.schicht_rows) && data.schicht_rows.length > 0;
  const skipKeys = new Set([
    "schicht_a1",
    "schicht_a2",
    "schicht_b",
    "schicht_c",
    "schicht_d",
    "schicht_e",
    "schicht_f",
    "schicht_g",
    "schicht_h",
    "feststellungen",
    "proben_art",
    "proben_nr",
    "proben_tiefe",
    "grundwasserstand",
    "datum",
    "uhrzeit",
    "tiefe_m",
    "uk_verrohrg",
    "bohrtiefe",
  ]);

  // Datenfelder anhand Mapping platzieren
  SV_FIELDS.forEach((field) => {
    if (hasRowData && skipKeys.has(field.key)) return;
    const pageIndex = Math.max(0, Math.min(pages.length - 1, field.page - 1));
    const value =
      data?.[field.key] ??
      field.aliases?.map((k) => data?.[k]).find((v) => v != null);
    const text = value == null ? "" : String(value);
    if (!text) return;
    const x = field.x + (pageIndex === 0 ? getPage1FieldOffset(field.key, "x") : 0);
    const y = field.y + (pageIndex === 0 ? getPage1FieldOffset(field.key, "y") : 0);
    drawText(pageIndex, text, x, y, field.size ?? 10);
  });

  if (hasRowData) {
    const rowHeight = Number(data?.schicht_row_height) || 95;
    const fallbackRowsPerPage = Math.max(1, Number(data?.schicht_rows_per_page) || 4);
    const rowsPerPagePage1 = Math.max(
      1,
      Number(data?.schicht_rows_per_page_1) || fallbackRowsPerPage
    );
    const rowsPerPagePage2 = Math.max(
      1,
      Number(data?.schicht_rows_per_page_2) || fallbackRowsPerPage
    );
    const startOffsetPage1 = Number(data?.schicht_start_offset_page_1) || 0;
    const startOffsetPage2 = Number(data?.schicht_start_offset_page_2) || 0;
    const xOffsetPage1 = Number(data?.schicht_x_offset_page_1) || 0;
    const xOffsetPage2 = Number(data?.schicht_x_offset_page_2) || 0;
    const rowOffsetsPage2 = Array.isArray(data?.schicht_row_offsets_page_2)
      ? (data.schicht_row_offsets_page_2 as Array<number | string>)
      : [];
    const xOffsetsPage1 =
      (data?.schicht_x_offsets_page_1 as Record<string, number>) ||
      (data?.schicht_x_offsets as Record<string, number>) ||
      {};
    const xOffsetsPage2 =
      (data?.schicht_x_offsets_page_2 as Record<string, number>) ||
      (data?.schicht_x_offsets as Record<string, number>) ||
      {};
    const rowFields = {
      a1: "schicht_a1",
      a2: "schicht_a2",
      b: "schicht_b",
      c: "schicht_c",
      d: "schicht_d",
      e: "schicht_e",
      f: "schicht_f",
      g: "schicht_g",
      h: "schicht_h",
      feststellungen: "feststellungen",
      proben_art: "proben_art",
      proben_nr: "proben_nr",
      proben_tiefe: "proben_tiefe",
    } as const;

    const festField = fieldMap.get("feststellungen");
    const probenArtField = fieldMap.get("proben_art");
    const getXOffset = (key: string, pageIndex: number) => {
      const source = pageIndex === 0 ? xOffsetsPage1 : xOffsetsPage2;
      return Number(source?.[key]) || 0;
    };
    const maxRows = rowsPerPagePage1 + rowsPerPagePage2;
    const ansatzField = fieldMap.get("schicht_ansatzpunkt_bis");

    data.schicht_rows.forEach((row: any, idx: number) => {
      if (idx >= maxRows) return;
      const pageIndex = idx < rowsPerPagePage1 ? 0 : 1;
      const localIdx = idx < rowsPerPagePage1 ? idx : idx - rowsPerPagePage1;
      const yOffset =
        localIdx * rowHeight +
        (pageIndex === 1 ? Number(rowOffsetsPage2[localIdx]) || 0 : 0);
      const pageStartOffset = pageIndex === 0 ? startOffsetPage1 : startOffsetPage2;
      const pageXOffset = pageIndex === 0 ? xOffsetPage1 : xOffsetPage2;
      if (ansatzField) {
        const value = row?.ansatzpunkt_bis;
        const text = value == null ? "" : String(value);
        if (text) {
          drawText(
            pageIndex,
            text,
            ansatzField.x +
              pageXOffset +
              getXOffset("ansatzpunkt_bis", pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "x") +
                  getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "x")
                : 0),
            ansatzField.y +
              pageStartOffset -
              yOffset +
              (pageIndex === 0
                ? getPage1FieldOffset("schicht_ansatzpunkt_bis", "y") +
                  getRowFieldOffsetPage1(localIdx, "schicht_ansatzpunkt_bis", "y")
                : 0),
            ansatzField.size ?? 10
          );
        }
      }
      Object.entries(rowFields).forEach(([rowKey, fieldKey]) => {
        const field = fieldMap.get(fieldKey);
        if (!field) return;
        const value = row?.[rowKey];
        const text = value == null ? "" : String(value);
        if (!text) return;
        if (fieldKey === "feststellungen" && festField && probenArtField) {
          const festX =
            festField.x +
            pageXOffset +
            getXOffset("feststellungen", pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset("feststellungen", "x") +
                getRowFieldOffsetPage1(localIdx, "feststellungen", "x")
              : 0);
          const probenX =
            probenArtField.x +
            pageXOffset +
            getXOffset("proben_art", pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset("proben_art", "x") +
                getRowFieldOffsetPage1(localIdx, "proben_art", "x")
              : 0);
          const maxWidth = Math.max(40, probenX - festX - 6);
          const maxHeight = Math.max(40, Math.min(rowHeight - 20, 120));
          drawWrappedText(
            pageIndex,
            text,
            festX,
            festField.y +
              pageStartOffset -
              yOffset +
              (pageIndex === 0
                ? getPage1FieldOffset("feststellungen", "y") +
                  getRowFieldOffsetPage1(localIdx, "feststellungen", "y")
                : 0),
            maxWidth,
            maxHeight,
            field.size ?? 10
          );
          return;
        }
        if (fieldKey === "proben_tiefe" && field?.width) {
          const list = Array.isArray(row?.proben_tiefen)
            ? row.proben_tiefen.filter((v: any) => String(v ?? "").trim() !== "").slice(0, 10)
            : [];
          if (list.length) {
            const x =
              field.x +
              pageXOffset +
              getXOffset(rowKey as keyof typeof rowFields, pageIndex) +
              (pageIndex === 0
                ? getPage1FieldOffset(fieldKey, "x") +
                  getRowFieldOffsetPage1(localIdx, fieldKey, "x")
                : 0);
            const yTop =
              field.y +
              pageStartOffset -
              yOffset +
              (pageIndex === 0
                ? getPage1FieldOffset(fieldKey, "y") +
                  getRowFieldOffsetPage1(localIdx, fieldKey, "y")
                : 0);
            const maxWidth = Math.max(20, field.width);
            const maxHeight = Math.max(20, rowHeight - 10);
            const fixedSize = field.size ?? 6;
            const lineHeight = Math.max(8, Math.round(fixedSize * 1.2));
            const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
            list.slice(0, maxLines).forEach((val: any, i: number) => {
              const textLine = wrapText(String(val), maxWidth, fixedSize)[0] ?? "";
              drawText(pageIndex, textLine, x, yTop - i * lineHeight, fixedSize);
            });
            return;
          }
          const x =
            field.x +
            pageXOffset +
            getXOffset(rowKey as keyof typeof rowFields, pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "x") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "x")
              : 0);
          const yTop =
            field.y +
            pageStartOffset -
            yOffset +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "y") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "y")
              : 0);
          const maxWidth = Math.max(20, field.width);
          const maxHeight = Math.max(20, rowHeight - 10);
          const baseSize = field.size ?? 6;
          const fitSizes = [baseSize, Math.max(4, baseSize - 1), Math.max(4, baseSize - 2)];
          const lineHeightFor = (s: number) => Math.max(10, Math.round(s * 1.25));
          const maxLinesFor = (s: number) => Math.max(1, Math.floor(maxHeight / lineHeightFor(s)));
          const linesFor = (s: number) => {
            const paragraphs = text.split("\n");
            const lines: string[] = [];
            paragraphs.forEach((para) => {
              if (!para.trim()) {
                lines.push("");
                return;
              }
              wrapText(para, maxWidth, s).forEach((ln) => lines.push(ln));
            });
            return lines;
          };
          let chosenSize = baseSize;
          for (const s of fitSizes) {
            if (linesFor(s).length <= maxLinesFor(s)) {
              chosenSize = s;
              break;
            }
          }
          drawWrappedText(pageIndex, text, x, yTop, maxWidth, maxHeight, chosenSize);
          return;
        }
        drawText(
          pageIndex,
          text,
          field.x +
            pageXOffset +
            getXOffset(rowKey as keyof typeof rowFields, pageIndex) +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "x") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "x")
              : 0),
          field.y +
            pageStartOffset -
            yOffset +
            (pageIndex === 0
              ? getPage1FieldOffset(fieldKey, "y") +
                getRowFieldOffsetPage1(localIdx, fieldKey, "y")
              : 0),
          field.size ?? 10
        );
      });
    });
  }

  const groundwaterRows = Array.isArray(data?.grundwasser_rows)
    ? data.grundwasser_rows
    : [];
  if (groundwaterRows.length) {
    const gwFields = {
      grundwasserstand: "grundwasserstand",
      datum: "datum",
      uhrzeit: "uhrzeit",
      tiefe_m: "tiefe_m",
      uk_verrohrg: "uk_verrohrg",
      bohrtiefe: "bohrtiefe",
    } as const;
    const gwRowH = Number(data?.grundwasser_row_height) || 16;

    groundwaterRows.slice(0, 4).forEach((row: any, idx: number) => {
      Object.entries(gwFields).forEach(([rowKey, fieldKey]) => {
        const field = fieldMap.get(fieldKey);
        if (!field) return;
        const value = row?.[rowKey];
        const text = value == null ? "" : String(value);
        if (!text) return;
        drawText(
          field.page - 1,
          text,
          field.x + (field.page === 1 ? getPage1FieldOffset(field.key, "x") : 0),
          field.y - idx * gwRowH + 2 + (field.page === 1 ? getPage1FieldOffset(field.key, "y") : 0),
          field.size ?? 9
        );
      });
    });
  }

  return outDoc.save();
}
