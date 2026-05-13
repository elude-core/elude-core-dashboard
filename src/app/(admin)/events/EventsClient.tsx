"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle,
  ChevronRight,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Tag,
} from "lucide-react";

const EVENTS_URL =
  process.env.NEXT_PUBLIC_EVENTS_URL || "https://sync.elude.fr/events";

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
  debug:    { bg: "bg-zinc-100 dark:bg-zinc-800",    text: "text-zinc-500",            icon: Info },
  info:     { bg: "bg-blue-50 dark:bg-blue-900/30",  text: "text-blue-600 dark:text-blue-400", icon: Info },
  warn:     { bg: "bg-amber-50 dark:bg-amber-900/30",text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  error:    { bg: "bg-red-50 dark:bg-red-900/30",    text: "text-red-600 dark:text-red-400",  icon: AlertCircle },
  critical: { bg: "bg-red-100 dark:bg-red-900/50",   text: "text-red-700 dark:text-red-300",  icon: AlertCircle },
};

type Pill = { id: string; label: string; filter: Record<string, string>; icon?: typeof Info };

const PILLS: Pill[] = [
  { id: "all",       label: "Tous",       filter: {} },
  { id: "akeneo",    label: "Akeneo",     filter: { source: "akeneo" } },
  { id: "elude-sync",label: "Sync",       filter: { source: "elude-sync" } },
  { id: "medusa",    label: "Medusa",     filter: { source: "medusa" } },
  { id: "backup",    label: "Backups",    filter: { tag: "backup" } },
  { id: "product",   label: "Produits",   filter: { tag: "product" } },
  { id: "order",     label: "Commandes",  filter: { tag: "order" } },
  { id: "orphan",    label: "Orphelins",  filter: { tag: "orphan" } },
  { id: "errors",    label: "Erreurs",    filter: { severity: "error" } },
  { id: "critical",  label: "Critical",   filter: { severity: "critical" } },
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
    fetchEvents();
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events Timeline</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Système elude-core · {total} events au total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              autoRefresh
                ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                : "bg-zinc-50 border-zinc-200 text-zinc-600"
            }`}
          >
            {autoRefresh ? "Auto 30s" : "Manuel"}
          </button>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={total} icon={Database} color="text-blue-600" />
        <StatCard label="Erreurs" value={errorsCount} icon={AlertCircle} color="text-red-600" />
        <StatCard label="Warnings" value={warnsCount} icon={AlertTriangle} color="text-amber-600" />
        <StatCard label="Sources" value={Object.keys(stats?.by_source ?? {}).length} icon={Box} color="text-purple-600" />
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {PILLS.map((pill) => {
          const isActive = activePill === pill.id;
          return (
            <button
              key={pill.id}
              onClick={() => setActivePill(pill.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
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
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400">
          Erreur fetch : {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table */}
        <div className="lg:col-span-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800 text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-16">Time</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium w-24">Source</th>
                <th className="px-3 py-2 font-medium w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading && !data && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td>
                </tr>
              )}
              {!loading && data?.events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
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
                    <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                      {relativeTime(e.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 ${sty.text}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{e.title}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            <code className="font-mono">{e.type}</code>
                            {e.related_sku && (
                              <span className="ml-2 inline-flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {e.related_sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{e.source}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-4 h-fit sticky top-4">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} />
          ) : (
            <div className="text-sm text-zinc-500">
              Sélectionne un event pour voir les détails.
            </div>
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
    <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
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
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold break-words">{event.title}</div>
          <code className="text-xs text-zinc-500 font-mono">{event.type}</code>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
        <Field label="Source" value={event.source} />
        <Field label="Severity" value={event.severity} />
        <Field label="Date" value={new Date(event.created_at).toLocaleString()} />
        {event.related_sku && <Field label="SKU" value={event.related_sku} />}
        {event.related_id && <Field label="ID" value={event.related_id.slice(0, 16)} />}
      </div>

      {event.body && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500 mb-1">Body</div>
          <pre className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">{event.body}</pre>
        </div>
      )}

      {event.tags && event.tags.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500 mb-1">Tags</div>
          <div className="flex flex-wrap gap-1">
            {event.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.data !== null && event.data !== undefined && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <div className="text-xs uppercase text-zinc-500 mb-1">Data</div>
          <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 rounded p-2 overflow-x-auto max-h-72">
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
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}
