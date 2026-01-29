import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTagesberichtPdf } from "@/lib/pdf/tagesbericht";

export async function GET(_req: Request) {
  try {
    const supabase = await createClient();
    const reportId = "template-landscape";

    // optional: schneller Debug
    // return NextResponse.json({ HIT: "tagesbericht/[id]/route.ts", params });

    const { data: report, error } = await supabase
      .from("reports")
      .select("id, data")
      .eq("id", reportId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ error: "Report nicht gefunden." }, { status: 404 });
    }

    const pdfBytes = await generateTagesberichtPdf(report.data);
    const body = Buffer.from(pdfBytes);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="tagesbericht-${reportId}.pdf"`,
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
