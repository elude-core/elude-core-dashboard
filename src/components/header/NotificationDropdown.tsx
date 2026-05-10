"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { Dropdown } from "../ui/dropdown/Dropdown";
import type { Notification, NotificationStatus } from "@/lib/notifications";

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

function StatusIcon({ status }: { status: NotificationStatus }) {
  if (status === "down") return <XCircle className="h-5 w-5 text-red-500" />;
  if (status === "up") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "test") return <FlaskConical className="h-5 w-5 text-blue-500" />;
  return <Bell className="h-5 w-5 text-gray-400" />;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { data } = useNotifications();
  const notifications: Notification[] = data?.data ?? [];

  const downActive = notifications.length > 0 && notifications[0].status === "down";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        aria-label="Notifications"
      >
        {downActive && (
          <span className="absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-red-500">
            <span className="absolute inline-flex w-full h-full bg-red-500 rounded-full opacity-75 animate-ping" />
          </span>
        )}
        <Bell className="h-5 w-5" />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Notifications
          </h5>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
            aria-label="Close"
          >
            <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20">
              <path d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <li className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Aucune notification pour le moment
            </li>
          ) : (
            notifications.map((n) => (
              <li key={n.id}>
                <div className="flex gap-3 rounded-lg border-b border-gray-100 px-3 py-3 dark:border-gray-800">
                  <StatusIcon status={n.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {n.status === "down" ? "🔴 " : n.status === "up" ? "🟢 " : "🧪 "}
                      {n.service}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {n.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {formatRelative(n.startedAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        {notifications.length > 0 && (
          <Link
            href="/notifications"
            onClick={() => setIsOpen(false)}
            className="mt-3 block rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            View All Notifications
          </Link>
        )}
      </Dropdown>
    </div>
  );
}
