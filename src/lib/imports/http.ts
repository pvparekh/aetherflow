export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    url.endsWith("/preview") ? 250000 : 110000,
  );
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("application/json"))
      throw new Error("The server did not respond normally. Please retry.");
    const value = await res.json();
    if (!res.ok)
      throw new Error(value.error ?? `Request failed (${res.status})`);
    return value;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error(
        "The request timed out. Saved import progress can be resumed.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
