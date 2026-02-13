import { NextResponse } from "next/server";

export const runtime = "nodejs";

const readNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const unescapeHtmlLike = (value: string) =>
  value
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&");

const extractCoordsFromText = (text: string): { lat: number; lon: number } | null => {
  const normalized = unescapeHtmlLike(text);
  const patterns: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const m = normalized.match(pattern);
    if (!m) continue;

    if (pattern.source.startsWith("!2d")) {
      const lon = readNumber(m[1]);
      const lat = readNumber(m[2]);
      if (lat != null && lon != null) return { lat, lon };
      continue;
    }

    const lat = readNumber(m[1]);
    const lon = readNumber(m[2]);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
};

const extractGoogleMapsUrlFromHtml = (html: string): string | null => {
  const normalized = unescapeHtmlLike(html);
  const patterns = [
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /https?:\/\/(?:www\.)?google\.[^"'\s<]+\/maps\/[^"'\s<]+/i,
    /https?:\/\/maps\.app\.goo\.gl\/[^"'\s<]+/i,
    /https?:\\\/\\\/(?:www\.)?google\.[^"'\s<]+\\\/maps\\\/[^"'\s<]+/i,
    /https?:\\\/\\\/maps\.app\.goo\.gl\\\/[^"'\s<]+/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1] ?? match?.[0] ?? "";
    if (value) return unescapeHtmlLike(value);
  }
  return null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    let current = url;
    for (let i = 0; i < 6; i++) {
      const hop = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      });
      const location = hop.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      if (extractCoordsFromText(current)) break;
    }

    const res = await fetch(current, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ title: "Google Maps", resolvedUrl: url });
    }

    const html = await res.text();
    const extractedUrl = extractGoogleMapsUrlFromHtml(html);
    const coords = extractCoordsFromText(html) ?? extractCoordsFromText(extractedUrl ?? "") ?? extractCoordsFromText(res.url || "");
    const resolvedUrl = coords
      ? `https://www.google.com/maps?q=${coords.lat},${coords.lon}`
      : extractedUrl || res.url || url;
    const match = html.match(/<title>(.*?)<\/title>/i);
    const rawTitle = match?.[1]?.trim() ?? "";
    const title = rawTitle
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*Google My Maps\s*$/i, "")
      .replace(/\s*-\s*Google Maps\s*$/i, "")
      .trim();
    const safeTitle = title || "Google Maps";
    const needsQueryFallback = /(^|\.)maps\.app\.goo\.gl$/i.test(new URL(resolvedUrl).hostname);
    const resolvedForSave = needsQueryFallback
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeTitle)}`
      : resolvedUrl;

    return NextResponse.json({ title: safeTitle, resolvedUrl: resolvedForSave });
  } catch {
    return NextResponse.json({ title: "Google Maps", resolvedUrl: url });
  }
}
