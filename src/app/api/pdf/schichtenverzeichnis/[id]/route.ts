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

    // Keep saved-open rendering on the same path as preview to avoid drift.
    const reqUrl = new URL(req.url);
    const origin = reqUrl.origin;
    const previewUrl = new URL("/api/pdf/schichtenverzeichnis", origin);
    // Match current preview defaults in the form.
    if (!reqUrl.searchParams.has("debug")) {
      previewUrl.searchParams.set("debug", "1");
    }
    reqUrl.searchParams.forEach((value, key) => {
      if (!previewUrl.searchParams.has(key)) previewUrl.searchParams.set(key, value);
    });

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
      body: JSON.stringify(report.data),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Preview render failed", detail: detail || `POST /api/pdf/schichtenverzeichnis -> ${res.status}` },
        { status: 500 }
      );
    }
    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="schichtenverzeichnis-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
