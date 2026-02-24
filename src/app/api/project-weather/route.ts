import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { isAllowedMapsUrl } from "@/lib/mapsUrlSafety";

export const runtime = "nodejs";

type WeatherPayload = {
  latitude: number;
  longitude: number;
  locationName: string | null;
  current: {
    temperatureC: number | null;
    windKmh: number | null;
    weatherCode: number | null;
    time: string | null;
  };
  today: {
    tempMaxC: number | null;
    tempMinC: number | null;
    precipitationMm: number | null;
  };
};

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

const parseCoordPair = (value: string | null): { lat: number; lon: number } | null => {
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

const extractMidFromMapsUrl = (rawUrl: string): string | null => {
  const decoded = decodeRepeated(rawUrl);
  const match = decoded.match(/[?&#]mid=([^&#]+)/i);
  if (match?.[1]) return match[1].trim();
  try {
    const parsed = new URL(rawUrl);
    const mid = parsed.searchParams.get("mid")?.trim() ?? "";
    return mid || null;
  } catch {
    return null;
  }
};

const extractCoordsFromKml = (kml: string): { lat: number; lon: number } | null => {
  const normalized = unescapeHtmlLike(kml);
  const centerMatch = normalized.match(
    /<gx:LatLonQuad>\s*<coordinates>\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+/i
  );
  if (centerMatch) {
    const lon = readNumber(centerMatch[1]);
    const lat = readNumber(centerMatch[2]);
    if (lat != null && lon != null) return { lat, lon };
  }

  const coordinatesMatch = normalized.match(
    /<coordinates>\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*-?\d+(?:\.\d+)?)?/i
  );
  if (!coordinatesMatch) return null;
  const lon = readNumber(coordinatesMatch[1]);
  const lat = readNumber(coordinatesMatch[2]);
  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

const fetchCoordsFromMymapsMid = async (mid: string): Promise<{ lat: number; lon: number } | null> => {
  if (!mid) return null;
  const kmlUrl = new URL("https://www.google.com/maps/d/kml");
  kmlUrl.searchParams.set("mid", mid);
  kmlUrl.searchParams.set("forcekml", "1");

  try {
    const res = await fetch(kmlUrl.toString(), {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const kml = await res.text();
    return extractCoordsFromKml(kml);
  } catch {
    return null;
  }
};

const extractCoordsFromMapsUrl = (rawUrl: string): { lat: number; lon: number } | null => {
  const rawDecoded = decodeRepeated(rawUrl);
  const llMatch = rawDecoded.match(/[?&#]ll=([^&#]+)/i);
  if (llMatch?.[1]) {
    const pair = parseCoordPair(llMatch[1]);
    if (pair) return pair;
  }
  const centerMatch = rawDecoded.match(/[?&#]center=([^&#]+)/i);
  if (centerMatch?.[1]) {
    const pair = parseCoordPair(centerMatch[1]);
    if (pair) return pair;
  }
  try {
    const url = new URL(rawUrl);
    const combinedRaw = `${url.pathname}${url.search}${url.hash}`;
    let combined = combinedRaw;
    try {
      combined = decodeURIComponent(combinedRaw);
    } catch {
      combined = combinedRaw;
    }

    const directKeys = ["ll", "center", "q"];
    for (const key of directKeys) {
      const pair = parseCoordPair(url.searchParams.get(key));
      if (pair) return pair;
    }

    const pb = url.searchParams.get("pb");
    if (pb) {
      const pbPair = extractCoordsFromText(pb);
      if (pbPair) return pbPair;
    }

    const atMatch = combined.match(
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i
    );
    if (atMatch) {
      const lat = readNumber(atMatch[1]);
      const lon = readNumber(atMatch[2]);
      if (lat != null && lon != null) return { lat, lon };
    }

    const dMatch = combined.match(
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i
    );
    if (dMatch) {
      const lat = readNumber(dMatch[1]);
      const lon = readNumber(dMatch[2]);
      if (lat != null && lon != null) return { lat, lon };
    }

    const d2Match = combined.match(
      /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i
    );
    if (d2Match) {
      const lon = readNumber(d2Match[1]);
      const lat = readNumber(d2Match[2]);
      if (lat != null && lon != null) return { lat, lon };
    }

    return null;
  } catch {
    return null;
  }
};

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
    /https?:\\\/\\\/(?:www\.)?google\.[^"'\s<]+\\\/maps\\\/[^"'\s<]+/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1] ?? match?.[0] ?? "";
    if (value) return unescapeHtmlLike(value);
  }
  return null;
};

const resolveMapsUrl = async (rawUrl: string): Promise<string> => {
  if (!isAllowedMapsUrl(rawUrl)) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const isShortGoogleMaps =
      /(^|\.)maps\.app\.goo\.gl$/i.test(parsed.hostname) || /(^|\.)goo\.gl$/i.test(parsed.hostname);
    if (!isShortGoogleMaps) return rawUrl;

    // Prefer manual redirect hops to capture target map URL before consent/app pages.
    let current = rawUrl;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      });
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      const maybeCoords = extractCoordsFromMapsUrl(current);
      if (maybeCoords) return current;
      if (!/(google\.|goo\.gl)/i.test(new URL(current).hostname)) break;
    }

    const res = await fetch(current, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) return current;
    const text = await res.text();
    const extracted = extractGoogleMapsUrlFromHtml(text);
    return extracted || res.url || current;
  } catch {
    return rawUrl;
  }
};

const extractPlaceTitleFromHtml = (html: string): string | null => {
  const normalized = unescapeHtmlLike(html);
  const titleMatch = normalized.match(/<title>(.*?)<\/title>/i);
  const ogTitle = normalized.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const raw = (ogTitle || titleMatch?.[1] || "").trim();
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*Google Maps\s*$/i, "")
    .replace(/\s*-\s*Google My Maps\s*$/i, "")
    .trim();
  if (!cleaned || /^google maps$/i.test(cleaned)) return null;
  return cleaned;
};

const geocodePlaceName = async (name: string): Promise<{ lat: number; lon: number } | null> => {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", name);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "user-agent": "Drillexpert/1.0 (project weather)",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = rows?.[0];
    const lat = readNumber(first?.lat);
    const lon = readNumber(first?.lon);
    if (lat == null || lon == null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const mymapsUrl = searchParams.get("mymapsUrl")?.trim() ?? "";
  const placeHint = searchParams.get("placeHint")?.trim() ?? "";
  if (!mymapsUrl) {
    return NextResponse.json({ error: "Missing mymapsUrl" }, { status: 400 });
  }
  if (!isAllowedMapsUrl(mymapsUrl)) {
    return NextResponse.json({ error: "Ungültiger Maps-Link." }, { status: 400 });
  }

  const resolvedUrl = await resolveMapsUrl(mymapsUrl);
  if (!isAllowedMapsUrl(resolvedUrl)) {
    return NextResponse.json({ error: "Ungültiger Maps-Link." }, { status: 400 });
  }
  let coords = extractCoordsFromMapsUrl(mymapsUrl) ?? extractCoordsFromMapsUrl(resolvedUrl);
  if (!coords) {
    const mid = extractMidFromMapsUrl(mymapsUrl) ?? extractMidFromMapsUrl(resolvedUrl);
    if (mid) {
      coords = await fetchCoordsFromMymapsMid(mid);
    }
  }
  if (!coords) {
    try {
      const res = await fetch(resolvedUrl, {
        cache: "no-store",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; DrillexpertBot/1.0)",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      });
      if (res.ok) {
        if (res.url && !isAllowedMapsUrl(res.url)) {
          return NextResponse.json({ error: "Ungültiger Redirect-Zielhost." }, { status: 400 });
        }
        const html = await res.text();
        coords = extractCoordsFromText(html);
        const place = extractPlaceTitleFromHtml(html);
        if (!coords && place) {
          const geocoded = await geocodePlaceName(place);
          if (geocoded) coords = geocoded;
        }
      }
    } catch {
      // ignore; handled by final error below
    }
  }
  if (!coords && placeHint) {
    const hinted = await geocodePlaceName(placeHint);
    if (hinted) coords = hinted;
  }
  if (!coords) {
    return NextResponse.json(
      { error: "Keine Koordinaten im Google-Maps-Link gefunden." },
      { status: 422 }
    );
  }

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(coords.lat));
  weatherUrl.searchParams.set("longitude", String(coords.lon));
  weatherUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  weatherUrl.searchParams.set("forecast_days", "1");
  weatherUrl.searchParams.set("timezone", "auto");

  try {
    let locationName: string | null = null;
    try {
      const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
      reverseUrl.searchParams.set("format", "jsonv2");
      reverseUrl.searchParams.set("lat", String(coords.lat));
      reverseUrl.searchParams.set("lon", String(coords.lon));
      reverseUrl.searchParams.set("zoom", "14");
      reverseUrl.searchParams.set("addressdetails", "1");

      const reverseRes = await fetch(reverseUrl.toString(), {
        cache: "no-store",
        headers: {
          "user-agent": "Drillexpert/1.0 (project weather)",
          "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        },
      });

      if (reverseRes.ok) {
        const reverseJson = (await reverseRes.json()) as {
          display_name?: string;
          address?: {
            city?: string;
            town?: string;
            village?: string;
            hamlet?: string;
            municipality?: string;
            county?: string;
            state?: string;
          };
        };

        const a = reverseJson.address ?? {};
        locationName =
          a.city ||
          a.town ||
          a.village ||
          a.hamlet ||
          a.municipality ||
          a.county ||
          a.state ||
          reverseJson.display_name?.split(",")[0]?.trim() ||
          null;
      }
    } catch {
      locationName = null;
    }

    const res = await fetch(weatherUrl.toString(), {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Wetterdaten konnten nicht geladen werden." }, { status: 502 });
    }
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
        time?: string;
      };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
      };
    };

    const payload: WeatherPayload = {
      latitude: coords.lat,
      longitude: coords.lon,
      locationName,
      current: {
        temperatureC: data.current?.temperature_2m ?? null,
        windKmh: data.current?.wind_speed_10m ?? null,
        weatherCode: data.current?.weather_code ?? null,
        time: data.current?.time ?? null,
      },
      today: {
        tempMaxC: data.daily?.temperature_2m_max?.[0] ?? null,
        tempMinC: data.daily?.temperature_2m_min?.[0] ?? null,
        precipitationMm: data.daily?.precipitation_sum?.[0] ?? null,
      },
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Wetterdaten konnten nicht geladen werden." },
      { status: 502 }
    );
  }
}
