"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertCircle, AlertTriangle, Box, ChevronRight, Database, Info, Loader2, RefreshCw, Tag } from "lucide-react";

const EVENTS_URL = process.env.NEXT_PUBLIC_EVENTS_URL || "https://sync.elude.fr/events";

type EventSeverity = "debug" | "info" | "warn" | "error" | "critical";

type EventRow = {
  id: number;
  type: string;
  source: string;
  severity: EventSeverity;
  title: string;
  body: string | null;
  data: unknown;
  tags: string[] | null;
  related_sku: string | null;
  related_id: string | null;
  created_at: string;
};

type EventsResponse = {
  ok: boolean;
  count: number;
  events: EventRow[];
  stats: {
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
    by_source: Record<string, number>;
    total: number;
  };
};

const REFRESH_MS = 30_000;
const LIMIT = 100;

const SEVERITY_STYLES: Record<EventSeverity, { bg: string; text: string; icon: typeof Info }> = {
  debug: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", icon: Info },
  info: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", icon: Info },
  warn: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  error: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", icon: AlertCircle },
  critical: { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-300", icon: AlertCircle },
};

type Pill = { id: string; label: string; filter: Record<string, string>; icon?: typeof Info };

const PILLS: Pill[] = [
  { id: "all", label: "Tous", filter: {} },
  { id: "akeneo", label: "Akeneo", filter: { source: "akeneo" } },
  { id: "elude-sync", label: "Sync", filter: { source: "elude-sync" } },
  { id: "medusa", label: "Medusa", filter: { source: "medusa" } },
  { id: "backup", label: "Backups", filter: { tag: "backup" } },
  { id: "product", label: "Produits", filter: { tag: "product" } },
  { id: "order", label: "Commandes", filter: { tag: "order" } },
  { id: "orphan", label: "Orphelins", filter: { tag: "orphan" } },
  { id: "errors", label: "Erreurs", filter: { severity: "error" } },
  { id: "critical", label: "Critical", filter: { severity: "critical" } },
];

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j`;
}

export default function EventsClient() {
  const [activePill, setActivePill] = useState<string>("all");
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchEvents = useCallback(async () => {
    setError(null);
    const pill = PILLS.find((p) => p.id === activePill);
    const params = new URLSearchParams({ limit: String(LIMIT) });
    if (pill) {
      for (const [k, v] of Object.entries(pill.filter)) params.set(k, v);
    }
    try {
      const res = await fetch(`${EVENTS_URL}?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EventsResponse;
      setData(json);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [activePill]);

  useEffect(() => {
    setLoading(true);
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchEvents, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchEvents, autoRefresh]);

  const stats = data?.stats;
  const total = stats?.total ?? 0;
  const errorsCount = (stats?.by_severity?.error ?? 0) + (stats?.by_severity?.critical ?? 0);
  const warnsCount = stats?.by_severity?.warn ?? 0;

  return (
    <div className="space-y-6 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Events Timeline</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Système elude-core · {total} events au total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              autoRefresh
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "border-zinc-200 bg-zinc-50 text-zinc-600"
            }`}
          >
            {autoRefresh ? "Auto 30s" : "Manuel"}
          </button>
          <button
            type="button"
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={total} icon={Database} color="text-blue-600" />
        <StatCard label="Erreurs" value={errorsCount} icon={AlertCircle} color="text-red-600" />
        <StatCard label="Warnings" value={warnsCount} icon={AlertTriangle} color="text-amber-600" />
        <StatCard
          label="Sources"
          value={Object.keys(stats?.by_source ?? {}).length}
          icon={Box}
          color="text-purple-600"
        />
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {PILLS.map((pill) => {
          const isActive = activePill === pill.id;
          return (
            <button
              type="button"
              key={pill.id}
              onClick={() => setActivePill(pill.id)}
              className={`rounded-full px-3 py-1.5 font-medium text-sm transition ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700 text-sm dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
          Erreur fetch : {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Table */}
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <tr>
                <th className="w-16 px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="w-24 px-3 py-2 font-medium">Source</th>
                <th className="w-8 px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && !data && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="inline h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && data?.events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    Aucun event pour ce filtre.
                  </td>
                </tr>
              )}
              {data?.events.map((e) => {
                const sty = SEVERITY_STYLES[e.severity];
                const Icon = sty.icon;
                const isSelected = selectedEvent?.id === e.id;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEvent(e)}
                    className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      isSelected ? "bg-zinc-50 dark:bg-zinc-800" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{relativeTime(e.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 ${sty.text}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{e.title}</div>
                          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <code className="font-mono">{e.type}</code>
                            {e.related_sku && (
                              <span className="ml-2 inline-flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {e.related_sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{e.source}</td>
                    <td className="px-3 py-2 text-zinc-400 dark:text-zinc-500">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className="sticky top-4 h-fit rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} />
          ) : (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Sélectionne un event pour voir les détails.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Info;
  color: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase dark:text-zinc-400">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-1 font-bold text-2xl text-zinc-900 dark:text-zinc-100">{value.toLocaleString()}</div>
    </div>
  );
}

function EventDetail({ event }: { event: EventRow }) {
  const sty = SEVERITY_STYLES[event.severity];
  const Icon = sty.icon;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2">
        <span className={sty.text}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="break-words font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</div>
          <code className="font-mono text-xs text-zinc-500">{event.type}</code>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-zinc-200 border-t pt-2 dark:border-zinc-700">
        <Field label="Source" value={event.source} />
        <Field label="Severity" value={event.severity} />
        <Field label="Date" value={new Date(event.created_at).toLocaleString()} />
        {event.related_sku && <Field label="SKU" value={event.related_sku} />}
        {event.related_id && <Field label="ID" value={event.related_id.slice(0, 16)} />}
      </div>

      {event.body && (
        <div className="border-zinc-200 border-t pt-2 dark:border-zinc-700">
          <div className="mb-1 text-xs text-zinc-500 uppercase">Body</div>
          <pre className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">{event.body}</pre>
        </div>
      )}

      {event.tags && event.tags.length > 0 && (
        <div className="border-zinc-200 border-t pt-2 dark:border-zinc-700">
          <div className="mb-1 text-xs text-zinc-500 uppercase">Tags</div>
          <div className="flex flex-wrap gap-1">
            {event.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.data !== null && event.data !== undefined && (
        <div className="border-zinc-200 border-t pt-2 dark:border-zinc-700">
          <div className="mb-1 text-xs text-zinc-500 uppercase">Data</div>
          <pre className="max-h-72 overflow-x-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase dark:text-zinc-400">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}
