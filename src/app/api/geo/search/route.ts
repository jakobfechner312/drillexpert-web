import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GeoSuggestion = {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  postalCode?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] as GeoSuggestion[] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "de,at,ch");

  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "user-agent": "Drillexpert/1.0 (geo search)",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] as GeoSuggestion[] });
    }

    const data = (await res.json()) as Array<{
      place_id?: number;
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: {
        postcode?: string;
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        municipality?: string;
        county?: string;
        state?: string;
      };
    }>;

    const suggestions = (Array.isArray(data) ? data : [])
      .map((row) => {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const label = String(row.display_name ?? "").trim();
        if (!label) return null;
        const a = row.address ?? {};
        const shortLabel =
          a.city ||
          a.town ||
          a.village ||
          a.hamlet ||
          a.municipality ||
          a.county ||
          a.state ||
          label.split(",")[0]?.trim() ||
          label;
        const baseSuggestion = {
          id: String(row.place_id ?? `${lat},${lon}`),
          label,
          shortLabel,
          lat,
          lon,
        };
        const postalCode = String(a.postcode ?? "").trim();
        return postalCode
          ? ({ ...baseSuggestion, postalCode } satisfies GeoSuggestion)
          : (baseSuggestion satisfies GeoSuggestion);
      })
      .filter((x): x is GeoSuggestion => Boolean(x));

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] as GeoSuggestion[] });
  }
}
