"use client";

import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { CheckCircle2, XCircle, FlaskConical, Bell, Filter } from "lucide-react";
import type { NotificationStatus } from "@/lib/notifications";

const FILTERS: Array<{ value: NotificationStatus | "all"; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "all", label: "Tous", icon: Bell },
  { value: "down", label: "DOWN", icon: XCircle },
  { value: "up", label: "UP", icon: CheckCircle2 },
  { value: "test", label: "Tests", icon: FlaskConical },
];

function StatusIcon({ status, className = "h-5 w-5" }: { status: NotificationStatus; className?: string }) {
  if (status === "down") return <XCircle className={`${className} text-red-500`} />;
  if (status === "up") return <CheckCircle2 className={`${className} text-green-500`} />;
  if (status === "test") return <FlaskConical className={`${className} text-blue-500`} />;
  return <Bell className={`${className} text-gray-400`} />;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const [filter, setFilter] = useState<NotificationStatus | "all">("all");

  const all = data?.data ?? [];
  const filtered = filter === "all" ? all : all.filter((n) => n.status === filter);

  const counts: Record<NotificationStatus | "all", number> = {
    all: all.length,
    down: all.filter((n) => n.status === "down").length,
    up: all.filter((n) => n.status === "up").length,
    test: all.filter((n) => n.status === "test").length,
    error: all.filter((n) => n.status === "error").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Historique des alertes envoyées via le workflow n8n &laquo; Kuma down &raquo;.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        {FILTERS.map(({ value, label, icon: Icon }) => {
          const count = counts[value];
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-white/20" : "bg-gray-200 dark:bg-gray-700"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-500">
            Aucune notification {filter !== "all" ? `de type "${filter}"` : ""}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((n) => (
              <li key={n.id} className="flex gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="mt-0.5">
                  <StatusIcon status={n.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {n.status === "down" ? "🔴 DOWN" : n.status === "up" ? "🟢 UP" : "🧪 TEST"} — {n.service}
                    </p>
                    <p className="flex-shrink-0 text-xs text-gray-400 tabular-nums" title={formatDateTime(n.startedAt)}>
                      {formatRelative(n.startedAt)}
                    </p>
                  </div>
                  {n.message && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{n.message}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400 tabular-nums">{formatDateTime(n.startedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Les 20 derniers events. Refresh client 10s + cache 5s = fraîcheur ~15s max. Source : n8n executions du workflow{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">[Alert] Kuma service down → Telegram</code>.
      </p>
    </div>
  );
}
