import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const res = await fetch(previewUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report.data),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Preview render failed" }, { status: 500 });
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
