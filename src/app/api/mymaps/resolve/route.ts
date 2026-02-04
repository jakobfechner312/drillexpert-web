import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DrillexpertBot/1.0)",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch" }, { status: 400 });
    }

    const html = await res.text();
    const match = html.match(/<title>(.*?)<\/title>/i);
    const rawTitle = match?.[1]?.trim() ?? "";
    const title = rawTitle.replace(/\s+/g, " ").replace(" - Google My Maps", "").trim();

    return NextResponse.json({ title: title || "Google My Maps" });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 400 });
  }
}
