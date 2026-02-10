import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DomainCheckResponse = {
  domain: string;
  checkedAt: string;
  availability: {
    available: boolean | null;
    status: string;
  };
  pricing: {
    currency: string | null;
    registration: number | null;
    renewal: number | null;
    transfer: number | null;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readFirstNumber = (obj: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readFirstString = (obj: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
};

const readFirstNumberDeep = (
  value: unknown,
  keys: string[],
  depth = 0
): number | null => {
  if (depth > 4 || !isRecord(value)) return null;
  const direct = readFirstNumber(value, keys);
  if (direct != null) return direct;
  for (const nested of Object.values(value)) {
    const found = readFirstNumberDeep(nested, keys, depth + 1);
    if (found != null) return found;
  }
  return null;
};

const readFirstStringDeep = (
  value: unknown,
  keys: string[],
  depth = 0
): string | null => {
  if (depth > 4 || !isRecord(value)) return null;
  const direct = readFirstString(value, keys);
  if (direct != null) return direct;
  for (const nested of Object.values(value)) {
    const found = readFirstStringDeep(nested, keys, depth + 1);
    if (found != null) return found;
  }
  return null;
};

const normalizeDomain = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

export async function GET(request: Request) {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "VERCEL_API_TOKEN fehlt auf dem Server." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawDomain = searchParams.get("domain") ?? "";
  const domain = normalizeDomain(rawDomain);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return NextResponse.json({ error: "Ungültige Domain." }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    const [availabilityRes, priceRes] = await Promise.all([
      fetch(`https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/availability`, {
        method: "GET",
        headers,
        cache: "no-store",
      }),
      fetch(`https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/price`, {
        method: "GET",
        headers,
        cache: "no-store",
      }),
    ]);

    const availabilityJson: unknown = await availabilityRes.json().catch(() => ({}));
    const priceJson: unknown = await priceRes.json().catch(() => ({}));

    if (!availabilityRes.ok) {
      const message =
        (isRecord(availabilityJson) &&
          readFirstStringDeep(availabilityJson, ["error", "message"])) ||
        "Availability-Check fehlgeschlagen.";
      return NextResponse.json({ error: message }, { status: availabilityRes.status });
    }

    if (!priceRes.ok) {
      const message =
        (isRecord(priceJson) &&
          readFirstStringDeep(priceJson, ["error", "message"])) ||
        "Preis-Check fehlgeschlagen.";
      return NextResponse.json({ error: message }, { status: priceRes.status });
    }

    const availabilityObj = isRecord(availabilityJson) ? availabilityJson : {};
    const priceObj = isRecord(priceJson) ? priceJson : {};

    const explicitAvailable = availabilityObj["available"];
    const statusString =
      readFirstString(availabilityObj, ["status", "availability"]) ??
      (typeof explicitAvailable === "boolean" ? (explicitAvailable ? "available" : "unavailable") : "unknown");
    const available =
      typeof explicitAvailable === "boolean"
        ? explicitAvailable
        : statusString.toLowerCase().includes("available")
          ? true
          : statusString.toLowerCase().includes("unavailable")
            ? false
            : null;

    const payload: DomainCheckResponse = {
      domain,
      checkedAt: new Date().toISOString(),
      availability: {
        available,
        status: statusString,
      },
      pricing: {
        currency: readFirstStringDeep(priceObj, ["currency", "currencyCode"]) ?? "USD",
        registration: readFirstNumberDeep(priceObj, [
          "purchasePrice",
          "purchase",
          "registration",
          "registrationPrice",
          "price",
          "firstYear",
        ]),
        renewal: readFirstNumberDeep(priceObj, ["renewalPrice", "renewal"]),
        transfer: readFirstNumberDeep(priceObj, ["transferPrice", "transfer"]),
      },
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Vercel-Domain-Check fehlgeschlagen." },
      { status: 502 }
    );
  }
}
