export interface KumaMonitor {
  id: number
  name: string
  status: 'up' | 'down' | 'pending' | 'maintenance'
  uptime24h?: number
  uptime7d?: number
  uptime30d?: number
  url?: string
}

export interface KumaStatusPage {
  config: {
    title: string
    slug: string
  }
  publicGroupList: Array<{
    name: string
    monitorList: KumaMonitor[]
  }>
  incident: unknown | null
}

export interface AggregateStatus {
  status: 'ok' | 'degraded' | 'down'
  upCount: number
  downCount: number
  totalCount: number
  services: KumaMonitor[]
}

async function kumaFetch(path: string): Promise<unknown> {
  const KUMA_URL = process.env.KUMA_API_URL
  const KUMA_KEY = process.env.KUMA_API_KEY
  if (!KUMA_URL) throw new Error('KUMA_API_URL env var is not set')
  const res = await fetch(`${KUMA_URL}${path}`, {
    headers: KUMA_KEY ? { Authorization: `Bearer ${KUMA_KEY}` } : {},
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Kuma API ${res.status}: ${path}`)
  return res.json()
}

export async function getStatusPage(slug = 'elude-core'): Promise<KumaStatusPage> {
  return kumaFetch(`/api/status-page/${slug}`) as Promise<KumaStatusPage>
}

export async function getAggregateStatus(slug = 'elude-core'): Promise<AggregateStatus> {
  const page = await getStatusPage(slug)
  const services = page.publicGroupList.flatMap((g) => g.monitorList)
  const upCount = services.filter((s) => s.status === 'up').length
  const downCount = services.filter((s) => s.status === 'down').length
  const totalCount = services.length

  let status: AggregateStatus['status'] = 'ok'
  if (downCount > 0 && downCount < totalCount) status = 'degraded'
  if (downCount === totalCount) status = 'down'

  return { status, upCount, downCount, totalCount, services }
}
