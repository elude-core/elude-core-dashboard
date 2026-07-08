/** Minuit Europe/Paris en epoch ms (DST-safe via Intl) — borne « aujourd'hui »
 *  partagée par les routes TV (/api/umami-live, /api/commerce-live). */
export function parisMidnightMs(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return now.getTime() - elapsedMs;
}
