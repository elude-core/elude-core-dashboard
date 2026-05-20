import {
  Activity,
  Bell,
  CalendarClock,
  GitBranch,
  LayoutDashboard,
  LinkIcon,
  type LucideIcon,
  Server,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Ops",
    items: [
      { title: "Vue d'ensemble", url: "/dashboard", icon: LayoutDashboard },
      { title: "Stack health", url: "/dashboard/stack-health", icon: Activity },
      { title: "Sync pipeline", url: "/dashboard/sync-pipeline", icon: GitBranch },
      { title: "Events", url: "/dashboard/events", icon: CalendarClock },
      { title: "Notifications", url: "/dashboard/notifications", icon: Bell },
    ],
  },
  {
    id: 2,
    label: "Infrastructure",
    items: [
      { title: "Infra (Hetzner)", url: "/dashboard/infra", icon: Server },
      { title: "Quick links", url: "/dashboard/links", icon: LinkIcon },
    ],
  },
];
