"use client";

import { Bug, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";

import { useSentryOverview } from "@/hooks/useSentryOverview";

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "—";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function LevelDot({ level }: { level: string }) {
  const color =
    level === "fatal" || level === "error"
      ? "bg-red-500"
      : level === "warning"
        ? "bg-yellow-500"
        : "bg-blue-500";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

export function SentryPanel() {
  const { data, isLoading } = useSentryOverview();
  const o = data?.data;
  const hasPaymentIssues = (o?.paymentDevisCount ?? 0) > 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-gray-200 border-b px-5 py-4 dark:border-gray-800">
        <h3 className="flex items-center gap-2 font-semibold text-base text-gray-900 dark:text-gray-100">
          <Bug className="h-5 w-5 text-purple-500" />
          Sentry · storefront
        </h3>
        <a
          href={o?.projectUrl ?? "https://elude.sentry.io"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline dark:text-blue-400"
        >
          Open Sentry <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {isLoading || !o ? (
        <div className="px-5 py-6 text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 border-gray-100 border-b p-5 dark:border-gray-800">
            <div>
              <p className="text-gray-500 text-xs">Issues actives (24h)</p>
              <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">{o.issues24h}</p>
            </div>
            <a href={o.alertUrl} target="_blank" rel="noopener noreferrer">
              <p className="flex items-center gap-1 text-gray-500 text-xs">
                Échec paiement / devis
                {hasPaymentIssues ? (
                  <ShieldAlert className="h-3 w-3 text-red-500" />
                ) : (
                  <ShieldCheck className="h-3 w-3 text-green-500" />
                )}
              </p>
              <p
                className={`font-bold text-2xl ${hasPaymentIssues ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}
              >
                {o.paymentDevisCount}
              </p>
            </a>
          </div>

          {o.issues.length > 0 ? (
            <div>
              <p className="px-5 pt-4 text-gray-500 text-xs uppercase tracking-wider">Top issues (24h)</p>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {o.issues.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <a
                      href={i.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-2.5 hover:underline"
                    >
                      <LevelDot level={i.level} />
                      <span className="truncate font-medium text-gray-900 dark:text-gray-100">{i.title}</span>
                    </a>
                    <span className="shrink-0 text-gray-500 text-xs">
                      {i.count} evts · {formatRelative(i.lastSeen)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-5 py-6 text-gray-500 text-sm">Aucune issue active sur 24h ✅</p>
          )}
        </>
      )}
    </div>
  );
}
