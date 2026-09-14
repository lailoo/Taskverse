export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const internal = new URL(request.url);
    const host = request.headers.get("host") || internal.host;
    return source.host === host && source.protocol === internal.protocol;
  } catch {
    return false;
  }
}
