import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDefaultTagesbericht } from "@/lib/defaultTagesbericht";

function normalizeTagesberichtPayload(raw: unknown) {
  const base = createDefaultTagesbericht();
  if (!raw || typeof raw !== "object") return base;

  const src =
    "data" in (raw as Record<string, unknown>) &&
    (raw as Record<string, unknown>).data &&
    typeof (raw as Record<string, unknown>).data === "object"
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  return {
    ...base,
    ...src,
    weather: {
      ...base.weather,
      ...((src.weather as Record<string, unknown> | undefined) ?? {}),
    },
    tableSectionsEnabled: {
      ...base.tableSectionsEnabled,
      ...((src.tableSectionsEnabled as Record<string, unknown> | undefined) ?? {}),
    },
    signatures: {
      ...base.signatures,
      ...((src.signatures as Record<string, unknown> | undefined) ?? {}),
    },
    workTimeRows: Array.isArray(src.workTimeRows) ? src.workTimeRows : base.workTimeRows,
    breakRows: Array.isArray(src.breakRows) ? src.breakRows : base.breakRows,
    transportRows: Array.isArray(src.transportRows) ? src.transportRows : base.transportRows,
    tableRows: Array.isArray(src.tableRows) ? src.tableRows : base.tableRows,
    workers: Array.isArray(src.workers) ? src.workers : base.workers,
    umsetzenRows: Array.isArray(src.umsetzenRows) ? src.umsetzenRows : base.umsetzenRows,
    pegelAusbauRows: Array.isArray(src.pegelAusbauRows) ? src.pegelAusbauRows : base.pegelAusbauRows,
    workCycles: Array.isArray(src.workCycles) ? src.workCycles : base.workCycles,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id param" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: report, error } = await supabase
      .from("reports")
      .select("id, data")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: "Report nicht gefunden." }, { status: 404 });

    console.log("[SAVED data]", report.data);

    const origin = new URL(req.url).origin;
    const previewUrl = new URL("/api/pdf/tagesbericht", origin);
    const payload = normalizeTagesberichtPayload(report.data);
    const forwardedHeaders = new Headers({ "Content-Type": "application/json" });
    const cookie = req.headers.get("cookie");
    const authorization = req.headers.get("authorization");
    const vercelBypass = req.headers.get("x-vercel-protection-bypass");
    const vercelSetBypass = req.headers.get("x-vercel-set-bypass-cookie");
    if (cookie) forwardedHeaders.set("cookie", cookie);
    if (authorization) forwardedHeaders.set("authorization", authorization);
    if (vercelBypass) forwardedHeaders.set("x-vercel-protection-bypass", vercelBypass);
    if (vercelSetBypass) forwardedHeaders.set("x-vercel-set-bypass-cookie", vercelSetBypass);

    const res = await fetch(previewUrl, {
      method: "POST",
      headers: forwardedHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Preview render failed", detail: detail || `POST /api/pdf/tagesbericht -> ${res.status}` },
        { status: 500 }
      );
    }
    const pdfBytes = new Uint8Array(await res.arrayBuffer());

    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="tagesbericht-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
