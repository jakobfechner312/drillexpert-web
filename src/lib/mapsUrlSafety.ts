const isGoogleHost = (hostname: string) =>
  /^google\.[a-z.]+$/i.test(hostname) || /\.google\.[a-z.]+$/i.test(hostname);

const isGooGlHost = (hostname: string) =>
  hostname === "goo.gl" || hostname.endsWith(".goo.gl");

export const isAllowedMapsHostname = (hostname: string) => {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  if (isGoogleHost(h)) return true;
  if (h === "maps.app.goo.gl") return true;
  if (isGooGlHost(h)) return true;
  return false;
};

export const isAllowedMapsUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return isAllowedMapsHostname(parsed.hostname);
  } catch {
    return false;
  }
};

