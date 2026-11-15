export function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  return host
    ? `${request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.slice(0, -1)}://${host}`
    : requestUrl.origin;
}

export function isSameOriginRequest(request: Request) {
  const expectedOrigin = getRequestOrigin(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  let sourceOrigin: string | null = origin;

  if (!sourceOrigin && referer) {
    try {
      sourceOrigin = new URL(referer).origin;
    } catch {
      return false;
    }
  }

  if (!sourceOrigin) return fetchSite === "same-origin";
  if (sourceOrigin !== expectedOrigin) return false;
  return !fetchSite || fetchSite === "same-origin";
}
