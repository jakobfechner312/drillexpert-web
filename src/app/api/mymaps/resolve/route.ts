import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { isAllowedMapsHostname, isAllowedMapsUrl } from "@/lib/mapsUrlSafety";

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

const decodeRepeated = (value: string, rounds = 3) => {
  let out = value;
  for (let i = 0; i < rounds; i += 1) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
};

const extractCoordsFromText = (text: string): { lat: number; lon: number } | null => {
  const normalized = decodeRepeated(unescapeHtmlLike(text));
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

const parseCoordPair = (value: string | null | undefined): { lat: number; lon: number } | null => {
  if (!value) return null;
  const cleaned = decodeRepeated(value).trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = readNumber(match[1]);
  const lon = readNumber(match[2]);
  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
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

const userAgents = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
];

const followShortLink = async (startUrl: string): Promise<string> => {
  for (const ua of userAgents) {
    let current = startUrl;
    for (let i = 0; i < 8; i++) {
      try {
        const hop = await fetch(current, {
          redirect: "manual",
          cache: "no-store",
          headers: {
            "user-agent": ua,
            "accept-language": "de-DE,de;q=0.9,en;q=0.8",
          },
        });
        const location = hop.headers.get("location");
        if (!location) break;
        current = new URL(location, current).toString();
        if (/google\./i.test(new URL(current).hostname) && /\/maps\//i.test(new URL(current).pathname)) {
          return current;
        }
      } catch {
        break;
      }
    }
  }
  return startUrl;
};

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (!isAllowedMapsUrl(url)) {
    return NextResponse.json({ error: "Ungültiger Maps-Link" }, { status: 400 });
  }

  try {
    const decodedInput = decodeRepeated(url);
    const llMatch = decodedInput.match(/[?&#]ll=([^&#]+)/i);
    if (llMatch?.[1]) {
      const coords = parseCoordPair(llMatch[1]);
      if (coords) {
        return NextResponse.json({
          title: "Google Maps",
          resolvedUrl: `https://www.google.com/maps?q=${coords.lat},${coords.lon}`,
        });
      }
    }

    const current = await followShortLink(url);
    let currentParsed: URL;
    try {
      currentParsed = new URL(current);
    } catch {
      return NextResponse.json({ error: "Ungültiger Maps-Link" }, { status: 400 });
    }
    if (!isAllowedMapsHostname(currentParsed.hostname)) {
      return NextResponse.json({ error: "Ungültiger Maps-Link" }, { status: 400 });
    }
    if (
      /(^|\.)goo\.gl$/i.test(currentParsed.hostname) ||
      /(^|\.)maps\.app\.goo\.gl$/i.test(currentParsed.hostname)
    ) {
      return NextResponse.json({ error: "Maps-Link konnte nicht aufgelöst werden" }, { status: 422 });
    }

    const res = await fetch(current, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ title: "Google Maps", resolvedUrl: url });
    }
    if (res.url && !isAllowedMapsUrl(res.url)) {
      return NextResponse.json({ error: "Ungültiger Redirect-Zielhost" }, { status: 400 });
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
    return NextResponse.json({ title: safeTitle, resolvedUrl });
  } catch {
    return NextResponse.json({ title: "Google Maps", resolvedUrl: url });
  }
}
