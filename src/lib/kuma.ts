export interface KumaMonitor {
  id: number;
  name: string;
  status: "up" | "down" | "pending" | "maintenance";
  uptime24h?: number;
  uptime7d?: number;
  uptime30d?: number;
  url?: string;
  ping?: number;
}

export interface KumaStatusPage {
  config: {
    title: string;
    slug: string;
  };
  publicGroupList: Array<{
    name: string;
    monitorList: Array<{
      id: number;
      name: string;
      sendUrl?: number;
      type?: string;
      tags?: unknown[];
    }>;
  }>;
  incident: unknown | null;
}

export interface KumaHeartbeatPayload {
  heartbeatList: Record<string, Array<{ status: number; time: string; msg: string; ping: number }>>;
  uptimeList: Record<string, number>;
}

export interface AggregateStatus {
  status: "ok" | "degraded" | "down";
  upCount: number;
  downCount: number;
  totalCount: number;
  services: KumaMonitor[];
}

const STATUS_MAP: Record<number, KumaMonitor["status"]> = {
  0: "down",
  1: "up",
  2: "pending",
  3: "maintenance",
};

async function kumaFetch(path: string): Promise<unknown> {
  const url = process.env.KUMA_API_URL;
  if (!url) throw new Error("KUMA_API_URL env var is not set");
  const apiKey = process.env.KUMA_API_KEY;
  const res = await fetch(`${url}${path}`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kuma API ${res.status}: ${path}`);
  return res.json();
}

export async function getStatusPage(slug = "elude-core"): Promise<KumaStatusPage> {
  return kumaFetch(`/api/status-page/${slug}`) as Promise<KumaStatusPage>;
}

export async function getHeartbeats(slug = "elude-core"): Promise<KumaHeartbeatPayload> {
  return kumaFetch(`/api/status-page/heartbeat/${slug}`) as Promise<KumaHeartbeatPayload>;
}

export async function getAggregateStatus(slug = "elude-core"): Promise<AggregateStatus> {
  const [page, hb] = await Promise.all([getStatusPage(slug), getHeartbeats(slug)]);

  const services: KumaMonitor[] = page.publicGroupList.flatMap((group) =>
    group.monitorList.map((m) => {
      const heartbeats = hb.heartbeatList[String(m.id)] || [];
      const last = heartbeats[heartbeats.length - 1];
      return {
        id: m.id,
        name: m.name,
        status: last ? STATUS_MAP[last.status] ?? "pending" : "pending",
        uptime24h: hb.uptimeList[`${m.id}_24`],
        uptime30d: hb.uptimeList[`${m.id}_720`],
        ping: last?.ping,
      };
    }),
  );

  const upCount = services.filter((s) => s.status === "up").length;
  const downCount = services.filter((s) => s.status === "down").length;
  const totalCount = services.length;

  let status: AggregateStatus["status"] = "ok";
  if (downCount > 0 && downCount < totalCount) status = "degraded";
  if (downCount === totalCount && totalCount > 0) status = "down";

  return { status, upCount, downCount, totalCount, services };
}
