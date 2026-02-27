import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { generateExcelProtocolPdf } from "@/lib/pdf/excelProtocolPdf";

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
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const forbidden = ensureExcelBetaUser(auth.user?.email);
  if (forbidden) return forbidden;

  return NextResponse.json({
    ok: true,
    route: "/api/pdf/excel/klarspuel",
    method: "POST",
    note: "Exportiert Klarspülprotokoll als PDF.",
  });
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;
    const forbidden = ensureExcelBetaUser(auth.user?.email);
    if (forbidden) return forbidden;

    let payload: any;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      const payloadRaw = form.get("payload_json") ?? form.get("payload");
      if (typeof payloadRaw !== "string" || !payloadRaw.trim()) {
        return NextResponse.json({ error: "Missing payload_json" }, { status: 400 });
      }
      payload = JSON.parse(payloadRaw);
    }

    const pdfBytes = await generateExcelProtocolPdf("Klarspül-Protokoll", payload ?? {});
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `KlarSpuel-${stamp}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
