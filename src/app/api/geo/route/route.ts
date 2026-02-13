import { NextResponse } from "next/server";

export const runtime = "nodejs";

const readNum = (v: string | null) => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromLat = readNum(searchParams.get("fromLat"));
  const fromLon = readNum(searchParams.get("fromLon"));
  const toLat = readNum(searchParams.get("toLat"));
  const toLon = readNum(searchParams.get("toLon"));

  if (
    fromLat == null ||
    fromLon == null ||
    toLat == null ||
    toLon == null ||
    Math.abs(fromLat) > 90 ||
    Math.abs(toLat) > 90 ||
    Math.abs(fromLon) > 180 ||
    Math.abs(toLon) > 180
  ) {
    return NextResponse.json({ error: "Ungültige Koordinaten." }, { status: 400 });
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Route nicht verfügbar." }, { status: 502 });
    }
    const data = (await res.json()) as {
      routes?: Array<{ distance?: number; duration?: number }>;
    };
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    const distanceMeters = typeof route?.distance === "number" ? route.distance : null;
    const durationSeconds = typeof route?.duration === "number" ? route.duration : null;
    if (distanceMeters == null || durationSeconds == null) {
      return NextResponse.json({ error: "Route nicht verfügbar." }, { status: 404 });
    }
    return NextResponse.json({ distanceMeters, durationSeconds });
  } catch {
    return NextResponse.json({ error: "Route nicht verfügbar." }, { status: 502 });
  }
}
