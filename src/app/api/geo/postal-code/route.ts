import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ postalCode: "", place: "" }, { status: 400 });
  }

  const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  reverseUrl.searchParams.set("format", "jsonv2");
  reverseUrl.searchParams.set("lat", String(lat));
  reverseUrl.searchParams.set("lon", String(lon));
  reverseUrl.searchParams.set("zoom", "14");
  reverseUrl.searchParams.set("addressdetails", "1");

  try {
    const reverseRes = await fetch(reverseUrl.toString(), {
      cache: "no-store",
      headers: {
        "user-agent": "Drillexpert/1.0 (postal code)",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    if (!reverseRes.ok) {
      return NextResponse.json({ postalCode: "", place: "" });
    }
    const reverseJson = (await reverseRes.json()) as {
      display_name?: string;
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
    };
    const a = reverseJson.address ?? {};
    const place =
      a.city ||
      a.town ||
      a.village ||
      a.hamlet ||
      a.municipality ||
      a.county ||
      a.state ||
      reverseJson.display_name?.split(",")[0]?.trim() ||
      "";

    return NextResponse.json({
      postalCode: String(a.postcode ?? "").trim(),
      place: String(place ?? "").trim(),
    });
  } catch {
    return NextResponse.json({ postalCode: "", place: "" });
  }
}

