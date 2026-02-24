import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDefaultTagesbericht } from "@/lib/defaultTagesbericht";

function sanitizeFilenamePart(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9-_]+/gi, "_");
}

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
    customWorkCycles: Array.isArray(src.customWorkCycles) ? src.customWorkCycles : [],
  };
}

function alignTagesberichtPayloadForPdf<T extends Record<string, unknown>>(source: T): T {
  const workCyclesSame = Boolean(source.workCyclesSame);
  if (workCyclesSame) return source;

  const workers = Array.isArray(source.workers) ? source.workers : [];
  const union: string[] = [];
  const pushCycle = (label: unknown) => {
    const trimmed = String(label ?? "").trim();
    if (!trimmed) return;
    if (!union.includes(trimmed)) union.push(trimmed);
  };

  workers.forEach((worker) => {
    const list = Array.isArray((worker as { workCycles?: unknown[] }).workCycles)
      ? ((worker as { workCycles?: unknown[] }).workCycles as unknown[])
      : [];
    list.forEach(pushCycle);
  });

  const fallbackCycles = Array.isArray(source.workCycles) ? source.workCycles : [];
  const cycles = union.length ? union : fallbackCycles.length ? fallbackCycles : [""];

  const mappedWorkers = workers.map((worker) => {
    const list = Array.isArray((worker as { workCycles?: unknown[] }).workCycles)
      ? ((worker as { workCycles?: unknown[] }).workCycles as unknown[])
      : [];
    const st = Array.isArray((worker as { stunden?: unknown[] }).stunden)
      ? ((worker as { stunden?: unknown[] }).stunden as unknown[])
      : [];
    const map = new Map<string, unknown>();
    list.forEach((label, idx) => {
      const key = String(label ?? "").trim();
      if (!key) return;
      map.set(key, st[idx] ?? "");
    });
    const aligned = cycles.map((label) => map.get(String(label ?? "").trim()) ?? "");
    return { ...(worker as Record<string, unknown>), stunden: aligned };
  });

  return {
    ...source,
    workCycles: cycles,
    workers: mappedWorkers,
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

    const origin = new URL(req.url).origin;
    const previewUrl = new URL("/api/pdf/tagesbericht", origin);
    const payload = alignTagesberichtPayloadForPdf(normalizeTagesberichtPayload(report.data));
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
    const filename = `${sanitizeFilenamePart(payload?.aNr) || "ohne_auftragsnummer"}_${sanitizeFilenamePart(payload?.name) || "ohne_bohrmeister"}_${sanitizeFilenamePart(payload?.date) || "ohne_datum"}.pdf`;

    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
