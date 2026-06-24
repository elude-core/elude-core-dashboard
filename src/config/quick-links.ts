export interface QuickLink {
  id: string;
  name: string;
  url: string;
  iconName: string;
  description?: string;
}

export const QUICK_LINKS: QuickLink[] = [
  { id: "coolify", name: "Coolify", url: "https://coolify.elude.fr", iconName: "Server", description: "Orchestrator" },
  {
    id: "medusa",
    name: "Medusa Admin",
    url: "https://medusa.elude.fr/app",
    iconName: "ShoppingCart",
    description: "Commerce",
  },
  {
    id: "payload",
    name: "Payload CMS",
    url: "https://payload.elude.fr/admin",
    iconName: "FileText",
    description: "CMS",
  },
  { id: "n8n", name: "n8n", url: "https://n8n.elude.fr", iconName: "Workflow", description: "Automation" },
  { id: "kuma", name: "Uptime Kuma", url: "https://kuma.elude.fr", iconName: "Activity", description: "Monitoring" },
  {
    id: "status",
    name: "Status page",
    url: "https://status.elude.fr",
    iconName: "BarChart3",
    description: "Public status",
  },
  { id: "grafana", name: "Grafana", url: "https://grafana.elude.fr", iconName: "LineChart", description: "Metrics" },
  { id: "mailpit", name: "Mailpit", url: "https://mailpit.elude.fr", iconName: "Mail", description: "Email dev" },
  { id: "sentry", name: "Sentry", url: "https://elude.sentry.io/insights/projects/storefront/", iconName: "Bug", description: "Errors" },
  {
    id: "vercel",
    name: "Vercel team",
    url: "https://vercel.com/elude-core",
    iconName: "Cloud",
    description: "Cloud apps",
  },
  {
    id: "github",
    name: "GitHub org",
    url: "https://github.com/elude-core",
    iconName: "Github",
    description: "Source code",
  },
  {
    id: "outline",
    name: "Outline docs",
    url: "https://app.getoutline.com",
    iconName: "BookOpen",
    description: "Documentation",
  },
];
