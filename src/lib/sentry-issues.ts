/**
 * Fetcher Sentry (issues du storefront) pour le dashboard ops.
 * API REST Sentry — org `elude`, projet `storefront`, région DE.
 * Token read : `SENTRY_READ_TOKEN` (Issue & Event: Read).
 *
 * NB : nommé `sentry-issues` (pas `sentry`) pour ne pas confondre avec
 * `@sentry/nextjs` (capture des erreurs du dashboard lui-même).
 */

const SENTRY_BASE = "https://de.sentry.io/api/0";
const ORG = "elude";
const PROJECT = "storefront";
// Règle d'alerte « Échec paiement / devis » (lien direct depuis le panel).
const PAYMENT_ALERT_ID = "654322";

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  level: string;
  /** Total d'événements (lifetime) de l'issue. */
  count: number;
  lastSeen: string;
  permalink: string;
}

export interface SentryOverview {
  /** Issues non résolues vues sur 24h (cap 25). */
  issues24h: number;
  /** Issues non résolues taguées area=checkout-payment|devis (14j, cap 25). */
  paymentDevisCount: number;
  issues: SentryIssue[];
  paymentDevisIssues: SentryIssue[];
  projectUrl: string;
  alertUrl: string;
}

interface RawIssue {
  id: string;
  shortId?: string;
  title?: string;
  level?: string;
  count?: string;
  lastSeen?: string;
  permalink?: string;
  metadata?: { value?: string };
  project?: { id?: string };
}

async function sentryFetch(path: string): Promise<unknown> {
  const token = process.env.SENTRY_READ_TOKEN;
  if (!token) throw new Error("SENTRY_READ_TOKEN env var is not set");
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sentry API ${res.status}: ${path}`);
  return res.json();
}

function toIssue(raw: RawIssue): SentryIssue {
  return {
    id: String(raw.id),
    shortId: raw.shortId ?? "",
    title: raw.title || raw.metadata?.value || "Issue",
    level: raw.level ?? "error",
    count: Number(raw.count ?? 0),
    lastSeen: raw.lastSeen ?? "",
    permalink: raw.permalink ?? "",
  };
}

export async function getSentryOverview(): Promise<SentryOverview> {
  const recentQ = encodeURIComponent("is:unresolved");
  const pdQ = encodeURIComponent("is:unresolved area:[checkout-payment,devis]");
  const [recent, paymentDevis] = (await Promise.all([
    sentryFetch(
      `/projects/${ORG}/${PROJECT}/issues/?query=${recentQ}&statsPeriod=24h&sort=freq&limit=25`,
    ),
    sentryFetch(
      `/projects/${ORG}/${PROJECT}/issues/?query=${pdQ}&statsPeriod=14d&sort=date&limit=25`,
    ),
  ])) as [RawIssue[], RawIssue[]];

  const projectId = (recent[0] ?? paymentDevis[0])?.project?.id;

  return {
    issues24h: recent.length,
    paymentDevisCount: paymentDevis.length,
    issues: recent.slice(0, 8).map(toIssue),
    paymentDevisIssues: paymentDevis.slice(0, 5).map(toIssue),
    projectUrl: projectId
      ? `https://${ORG}.sentry.io/issues/?project=${projectId}&statsPeriod=24h`
      : `https://${ORG}.sentry.io/insights/projects/${PROJECT}/`,
    alertUrl: `https://${ORG}.sentry.io/monitors/alerts/${PAYMENT_ALERT_ID}/`,
  };
}
