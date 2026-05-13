import { NextResponse } from "next/server";

import { fetchWithFallback } from "@/lib/cache";

export const dynamic = "force-dynamic";

const HETZNER_API = "https://api.hetzner.cloud/v1";

export interface HetznerServer {
  id: number;
  name: string;
  status: string;
  ipv4: string;
  type: string;
  cores: number;
  ramGB: number;
  diskGB: number;
  datacenter: string;
  location: string;
  createdAt: string;
  ingoingTrafficGB: number;
  outgoingTrafficGB: number;
  includedTrafficGB: number;
}

export interface HetznerSnapshot {
  id: number;
  description: string | null;
  imageSizeGB: number | null;
  createdAt: string;
  status: string;
}

export interface HetznerPayload {
  server: HetznerServer | null;
  snapshots: HetznerSnapshot[];
}

async function fetchHetzner<T>(path: string): Promise<T> {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) throw new Error("HETZNER_API_TOKEN missing");

  const res = await fetch(`${HETZNER_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hetzner ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function getInfra(): Promise<HetznerPayload> {
  const [serversRes, snapshotsRes] = await Promise.all([
    fetchHetzner<{ servers: Array<Record<string, unknown>> }>("/servers"),
    fetchHetzner<{ images: Array<Record<string, unknown>> }>("/images?type=snapshot"),
  ]);

  const raw = serversRes.servers[0];
  const server: HetznerServer | null = raw
    ? {
        id: raw.id as number,
        name: raw.name as string,
        status: raw.status as string,
        ipv4: (raw.public_net as { ipv4: { ip: string } }).ipv4.ip,
        type: (raw.server_type as { name: string }).name,
        cores: (raw.server_type as { cores: number }).cores,
        ramGB: (raw.server_type as { memory: number }).memory,
        diskGB: (raw.server_type as { disk: number }).disk,
        datacenter: (raw.datacenter as { name: string }).name,
        location: (raw.datacenter as { location: { city: string } }).location.city,
        createdAt: raw.created as string,
        ingoingTrafficGB: ((raw.ingoing_traffic as number) ?? 0) / 1024 ** 3,
        outgoingTrafficGB: ((raw.outgoing_traffic as number) ?? 0) / 1024 ** 3,
        includedTrafficGB: ((raw.included_traffic as number) ?? 0) / 1024 ** 3,
      }
    : null;

  const snapshots: HetznerSnapshot[] = (snapshotsRes.images ?? []).map((img) => ({
    id: img.id as number,
    description: (img.description as string) ?? null,
    imageSizeGB: (img.image_size as number) ?? null,
    createdAt: img.created as string,
    status: img.status as string,
  }));

  return { server, snapshots };
}

export async function GET() {
  try {
    const result = await fetchWithFallback("hetzner:infra", getInfra, 60);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 503 });
  }
}
