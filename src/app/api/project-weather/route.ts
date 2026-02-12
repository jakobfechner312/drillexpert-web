import { NextResponse } from "next/server";

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

const parseCoordPair = (value: string | null): { lat: number; lon: number } | null => {
  if (!value) return null;
  const cleaned = decodeURIComponent(value).trim();
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = readNumber(match[1]);
  const lon = readNumber(match[2]);
  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

const extractCoordsFromMapsUrl = (rawUrl: string): { lat: number; lon: number } | null => {
  try {
    const url = new URL(rawUrl);

    const directKeys = ["ll", "center", "q"];
    for (const key of directKeys) {
      const pair = parseCoordPair(url.searchParams.get(key));
      if (pair) return pair;
    }

    const atMatch = `${url.pathname}${url.search}${url.hash}`.match(
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i
    );
    if (atMatch) {
      const lat = readNumber(atMatch[1]);
      const lon = readNumber(atMatch[2]);
      if (lat != null && lon != null) return { lat, lon };
    }

    const dMatch = `${url.pathname}${url.search}${url.hash}`.match(
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i
    );
    if (dMatch) {
      const lat = readNumber(dMatch[1]);
      const lon = readNumber(dMatch[2]);
      if (lat != null && lon != null) return { lat, lon };
    }

    return null;
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mymapsUrl = searchParams.get("mymapsUrl")?.trim() ?? "";
  if (!mymapsUrl) {
    return NextResponse.json({ error: "Missing mymapsUrl" }, { status: 400 });
  }

  const coords = extractCoordsFromMapsUrl(mymapsUrl);
  if (!coords) {
    return NextResponse.json(
      { error: "Keine Koordinaten im MyMaps-Link gefunden." },
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
