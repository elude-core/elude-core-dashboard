export interface ServiceMeta {
  kumaName: string;
  adminUrl?: string;
  iconName: string;
}

/** Mapping entre les noms réels des monitors Kuma et leurs meta (icône, lien admin). */
export const SERVICES: ServiceMeta[] = [
  { kumaName: "Medusa API", adminUrl: "https://medusa.elude.fr/app", iconName: "ShoppingCart" },
  { kumaName: "Medusa Admin", adminUrl: "https://medusa.elude.fr/app", iconName: "LayoutDashboard" },
  { kumaName: "Payload CMS", adminUrl: "https://payload.elude.fr/admin", iconName: "FileText" },
  { kumaName: "Coolify", adminUrl: "https://coolify.elude.fr", iconName: "Server" },
  { kumaName: "Grafana", adminUrl: "https://grafana.elude.fr", iconName: "LineChart" },
  { kumaName: "n8n", adminUrl: "https://n8n.elude.fr", iconName: "Workflow" },
];
