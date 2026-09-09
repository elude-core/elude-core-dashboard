import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    },
  },
}));

const snapshot = {
  version: 1,
  generated_at: "2026-09-09T03:15:00Z",
  source: "odoo:test",
  months: ["2026-08"],
  stores: { wynstor: [[1, 100, 2, 200, 1, 0, 25, 40]] },
  // Équipe Odoo sans boutique connue : compté et chiffré, jamais silencieux (contrat v1).
  unmapped: { count: 1, amount: 2160, teams: { "-": { count: 1, amount: 2160 } } },
  golives: [],
  seasonality: { web: {}, spread: {} },
  frozen: {
    measured_at: "2026-09-08",
    control_store: "pro-agrafeuses",
    effect_ca: { value: 1.93, ci: [1.38, 2.6] },
    effect_margin: { value: 1.85, ci: [1.33, 2.52] },
  },
};

beforeEach(() => {
  store.clear();
  process.env.VENTES_INGEST_SECRET = "s3cret";
});

const post = async (body: unknown, secret?: string) => {
  const { POST } = await import("./ingest/route");
  return POST(
    new Request("http://x/api/ventes/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-ingest-secret": secret } : {}) },
      body: JSON.stringify(body),
    }),
  );
};

describe("POST /api/ventes/ingest", () => {
  it("refuse sans le secret", async () => {
    expect((await post(snapshot)).status).toBe(401);
  });
  it("refuse une version inconnue", async () => {
    expect((await post({ ...snapshot, version: 99 }, "s3cret")).status).toBe(422);
  });
  it("refuse un corps qui n'a pas la forme attendue", async () => {
    expect((await post({ version: 1 }, "s3cret")).status).toBe(422);
  });
  it("refuse un instantané sans unmapped (obligatoire depuis la v1 du contrat)", async () => {
    const { unmapped: _unmapped, ...sansUnmapped } = snapshot;
    expect((await post(sansUnmapped, "s3cret")).status).toBe(422);
  });
  it("accepte et stocke", async () => {
    expect((await post(snapshot, "s3cret")).status).toBe(200);
    expect(store.get("ventes:snapshot")).toContain("2026-08");
  });
});

describe("GET /api/ventes", () => {
  it("rend 503 quand rien n'a encore été ingéré", async () => {
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(503);
  });
  it("rend l'instantané et son âge", async () => {
    await post(snapshot, "s3cret");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.months).toEqual(["2026-08"]);
    expect(body.unmapped).toEqual(snapshot.unmapped);
    expect(typeof body.age_hours).toBe("number");
  });
});
