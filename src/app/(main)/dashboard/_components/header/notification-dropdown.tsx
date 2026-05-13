"use client";

import Link from "next/link";

import { Bell, CheckCircle2, FlaskConical, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification, NotificationStatus } from "@/lib/notifications";
import { cn } from "@/lib/utils";

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
  if (status === "down") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "up") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "test") return <FlaskConical className="h-4 w-4 text-blue-500" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

export function NotificationDropdown() {
  const { data } = useNotifications();
  const notifications: Notification[] = data?.data ?? [];
  const downActive = notifications.length > 0 && notifications[0].status === "down";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Notifications">
          {downActive && (
            <span className="absolute top-1 right-1 z-10 h-2 w-2 rounded-full bg-red-500">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            </span>
          )}
          <Bell className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <span className="text-muted-foreground text-xs">{notifications.length} events</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-muted-foreground text-sm">Aucune notification pour le moment</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3 px-3 py-3">
                  <div className="mt-0.5">
                    <StatusIcon status={n.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {n.status === "down" ? "🔴 " : n.status === "up" ? "🟢 " : "🧪 "}
                      {n.service}
                    </p>
                    {n.message && <p className="mt-0.5 truncate text-muted-foreground text-xs">{n.message}</p>}
                    <p className="mt-1 text-muted-foreground text-xs">{formatRelative(n.startedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <Link
          href="/dashboard/notifications"
          className={cn(
            "block w-full rounded-sm px-3 py-2 text-center text-sm hover:bg-accent hover:text-accent-foreground",
          )}
        >
          Voir tout
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
