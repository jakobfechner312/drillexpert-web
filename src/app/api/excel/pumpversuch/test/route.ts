import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

const EXCEL_BETA_USERS = new Set(
  (process.env.EXCEL_BETA_USERS ?? process.env.NEXT_PUBLIC_EXCEL_BETA_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

function ensureExcelBetaUser(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !EXCEL_BETA_USERS.has(normalized)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;
    const forbidden = ensureExcelBetaUser(auth.user?.email);
    if (forbidden) return forbidden;

    const templatePath = path.join(process.cwd(), "public", "templates", "KlarSpuel.xlsx");
    const templateBytes = Buffer.from(await readFile(templatePath));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBytes as any);

    const sheet = workbook.getWorksheet("Tabelle1");
    if (!sheet) {
      return NextResponse.json({ error: "Vorlageblatt 'Tabelle1' nicht gefunden." }, { status: 404 });
    }

    // Kopfbereich (sichtbar für den ersten MVP-Test)
    sheet.getCell("I9").value = "DEMO-2026-001";
    sheet.getCell("I10").value = new Date().toLocaleDateString("de-DE");
    sheet.getCell("I11").value = "DrillExpert Test";

    // Erste Messzeile im Tabellenbereich
    sheet.getCell("A16").value = "MS-01";
    sheet.getCell("B16").value = 123.45;
    sheet.getCell("C16").value = "08:30";
    sheet.getCell("I16").value = "MVP-Testeintrag";

    const out = await workbook.xlsx.writeBuffer();
    const body = Buffer.from(out as ArrayBuffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Pumpversuch-MVP-Test.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
