import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSchichtenverzeichnisPdf } from "@/lib/pdf/schichtenverzeichnis";

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

    const url = new URL(req.url);
    const debugGrid = url.searchParams.get("debug") === "1";
    const pdfBytes = await generateSchichtenverzeichnisPdf(report.data, { debugGrid });

    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="schichtenverzeichnis-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
