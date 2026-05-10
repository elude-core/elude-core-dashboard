export interface ServiceMeta {
  id: string
  name: string
  type: 'orchestrator' | 'db' | 'commerce' | 'automation' | 'monitoring' | 'metrics' | 'email'
  adminUrl?: string
  iconName: string // nom Lucide
}

export const SERVICES: ServiceMeta[] = [
  { id: 'coolify', name: 'Coolify', type: 'orchestrator', adminUrl: 'https://coolify.elude.fr', iconName: 'Server' },
  { id: 'postgres', name: 'Postgres 17', type: 'db', iconName: 'Database' },
  { id: 'redis', name: 'Redis 7', type: 'db', iconName: 'Zap' },
  { id: 'meilisearch', name: 'Meilisearch v1.13', type: 'db', iconName: 'Search' },
  { id: 'medusa-server', name: 'Medusa v2 (server)', type: 'commerce', adminUrl: 'https://medusa.elude.fr/admin', iconName: 'ShoppingCart' },
  { id: 'medusa-worker', name: 'Medusa v2 (worker)', type: 'commerce', iconName: 'Cog' },
  { id: 'n8n', name: 'n8n', type: 'automation', adminUrl: 'https://n8n.elude.fr', iconName: 'Workflow' },
  { id: 'kuma', name: 'Uptime Kuma', type: 'monitoring', adminUrl: 'https://kuma.elude.fr', iconName: 'Activity' },
  { id: 'grafana', name: 'Grafana', type: 'monitoring', adminUrl: 'https://grafana.elude.fr', iconName: 'LineChart' },
  { id: 'prometheus', name: 'Prometheus', type: 'metrics', iconName: 'BarChart3' },
  { id: 'node-exporter', name: 'node-exporter', type: 'metrics', iconName: 'Cpu' },
  { id: 'cadvisor', name: 'cAdvisor', type: 'metrics', iconName: 'Box' },
  { id: 'postgres-exporter', name: 'postgres-exporter', type: 'metrics', iconName: 'DatabaseZap' },
  { id: 'redis-exporter', name: 'redis-exporter', type: 'metrics', iconName: 'ZapOff' },
  { id: 'mailpit', name: 'Mailpit', type: 'email', adminUrl: 'https://mailpit.elude.fr', iconName: 'Mail' },
]
