"use client";

import { Activity, CheckCircle2, ExternalLink, Workflow, XCircle } from "lucide-react";

import { useN8nStats } from "@/hooks/useN8nStats";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Activity className="h-4 w-4 text-yellow-500" />;
}

export function N8nPanel() {
  const { data, isLoading } = useN8nStats();
  const stats = data?.data;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-gray-200 border-b px-5 py-4 dark:border-gray-800">
        <h3 className="flex items-center gap-2 font-semibold text-base text-gray-900 dark:text-gray-100">
          <Workflow className="h-5 w-5 text-blue-500" />
          n8n Automation
        </h3>
        <a
          href="https://n8n.elude.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline dark:text-blue-400"
        >
          Open n8n <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {isLoading || !stats ? (
        <div className="px-5 py-6 text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 border-gray-100 border-b p-5 sm:grid-cols-4 dark:border-gray-800">
            <div>
              <p className="text-gray-500 text-xs">Active</p>
              <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">
                {stats.activeWorkflows}
                <span className="ml-1 font-normal text-gray-400 text-sm">/ {stats.totalWorkflows}</span>
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Runs 24h</p>
              <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">{stats.executions24h}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Errors 24h</p>
              <p
                className={`font-bold text-2xl ${stats.errors24h > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}
              >
                {stats.errors24h}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Last run</p>
              <p className="font-medium text-gray-900 text-sm dark:text-gray-100">
                {stats.lastExecution ? (
                  <span className="flex items-center gap-1.5">
                    <StatusIcon status={stats.lastExecution.status} />
                    {formatRelative(stats.lastExecution.startedAt)}
                  </span>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>

          {stats.recentRuns.length > 0 && (
            <div>
              <p className="px-5 pt-4 text-gray-500 text-xs uppercase tracking-wider">Recent runs</p>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {stats.recentRuns.slice(0, 5).map((run) => (
                  <li key={run.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <StatusIcon status={run.status} />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{run.workflowName}</span>
                    </div>
                    <span className="text-gray-500 text-xs">{formatRelative(run.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
