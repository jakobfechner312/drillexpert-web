import { NextResponse } from "next/server";
import { generateTagesberichtRheinMainLinkPdf } from "@/lib/pdf/tagesberichtRheinMainLink";
import { requireApiUser } from "@/lib/apiAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const data = await req.json();
    const pdfBytes = await generateTagesberichtRheinMainLinkPdf(data);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="tagesbericht-rhein-main-link.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Rhein-Main-Link preview failed", detail: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
