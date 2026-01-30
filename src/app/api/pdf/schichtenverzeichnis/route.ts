import { NextResponse } from "next/server";
import { generateSchichtenverzeichnisPdf } from "@/lib/pdf/schichtenverzeichnis";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const debugGrid = url.searchParams.get("debug") === "1";
    const debugGridStep = Number(url.searchParams.get("grid") ?? "") || undefined;
    const markerPage = Number(url.searchParams.get("page") ?? "") || undefined;
    const markerX = Number(url.searchParams.get("x") ?? "") || undefined;
    const markerY = Number(url.searchParams.get("y") ?? "") || undefined;
    const markerText = url.searchParams.get("text") ?? undefined;
    const markerSize = Number(url.searchParams.get("size") ?? "") || undefined;

    const markers =
      markerPage && markerX != null && markerY != null
        ? [
            {
              page: markerPage,
              x: markerX,
              y: markerY,
              text: markerText,
              size: markerSize,
            },
          ]
        : undefined;

    const pdfBytes = await generateSchichtenverzeichnisPdf(
      {},
      { debugGrid, debugGridStep, markers }
    );
    const body = Buffer.from(pdfBytes);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="schichtenverzeichnis.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "PDF generation failed", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const url = new URL(req.url);
    const debugGrid = url.searchParams.get("debug") === "1";
    const debugGridStep = Number(url.searchParams.get("grid") ?? "") || undefined;
    const markerPage = Number(url.searchParams.get("page") ?? "") || undefined;
    const markerX = Number(url.searchParams.get("x") ?? "") || undefined;
    const markerY = Number(url.searchParams.get("y") ?? "") || undefined;
    const markerText = url.searchParams.get("text") ?? undefined;
    const markerSize = Number(url.searchParams.get("size") ?? "") || undefined;

    const markers =
      markerPage && markerX != null && markerY != null
        ? [
            {
              page: markerPage,
              x: markerX,
              y: markerY,
              text: markerText,
              size: markerSize,
            },
          ]
        : undefined;

    const pdfBytes = await generateSchichtenverzeichnisPdf(
      data,
      { debugGrid, debugGridStep, markers }
    );
    const body = Buffer.from(pdfBytes);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="schichtenverzeichnis.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "PDF generation failed", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
