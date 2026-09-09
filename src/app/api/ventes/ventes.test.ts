import { beforeEach, describe, expect, it, vi } from "vitest";

import { VENTES_KEY } from "@/lib/ventes";

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
  golives: [{ store: "pro-rogneuses", date: "2026-06-27" }],
  seasonality: { web: { "1": 1.27 }, spread: { "1": 0.28 } },
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
  it("distingue le message d'une forme invalide de celui d'une version inconnue", async () => {
    const formeInvalide = await post({ version: 1 }, "s3cret");
    const versionInconnue = await post({ ...snapshot, version: 99 }, "s3cret");
    const { error: msgForme } = await formeInvalide.json();
    const { error: msgVersion } = await versionInconnue.json();
    expect(msgForme).not.toBe(msgVersion);
  });
  it("rend 422 (jamais 500) sur un corps dont un champ est du mauvais type — repro revue", async () => {
    // stores.wynstor: null ferait planter un `.length` non gardé — cf. finding IMPORTANT 2.
    const res = await post({ stores: { wynstor: null } }, "s3cret");
    expect(res.status).toBe(422);
  });
  it("accepte et stocke", async () => {
    expect((await post(snapshot, "s3cret")).status).toBe(200);
    expect(store.get("ventes:snapshot")).toContain("2026-08");
  });

  describe("champs requis par le contrat (au-delà de months/stores/unmapped)", () => {
    it("refuse une ligne mensuelle qui n'a pas 8 valeurs", async () => {
      const res = await post({ ...snapshot, stores: { wynstor: [[1, 100, 2, 200]] } }, "s3cret");
      expect(res.status).toBe(422);
    });
    it("refuse une ligne mensuelle avec une valeur non numérique", async () => {
      const res = await post({ ...snapshot, stores: { wynstor: [[1, 100, 2, 200, 1, 0, "25", 40]] } }, "s3cret");
      expect(res.status).toBe(422);
    });
    it("refuse des golives mal formés", async () => {
      const res = await post({ ...snapshot, golives: [{ store: "wynstor" }] }, "s3cret");
      expect(res.status).toBe(422);
    });
    it("refuse une seasonality incomplète (spread manquant)", async () => {
      const res = await post({ ...snapshot, seasonality: { web: {} } }, "s3cret");
      expect(res.status).toBe(422);
    });
    it("refuse un frozen incomplet (effect_margin manquant)", async () => {
      const res = await post(
        {
          ...snapshot,
          frozen: { measured_at: "2026-09-08", control_store: "pro-agrafeuses", effect_ca: { value: 1, ci: [1, 2] } },
        },
        "s3cret",
      );
      expect(res.status).toBe(422);
    });
    it("refuse un generated_at qui n'est pas une date", async () => {
      const res = await post({ ...snapshot, generated_at: "pas-une-date" }, "s3cret");
      expect(res.status).toBe(422);
    });
    it("accepte generated_at au format +00:00 (format réel produit par le script Odoo)", async () => {
      const res = await post({ ...snapshot, generated_at: "2026-09-09T02:36:45+00:00" }, "s3cret");
      expect(res.status).toBe(200);
    });
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
    expect(Number.isNaN(body.age_hours)).toBe(false);
  });
  it("rend 503 (jamais 500) si l'entrée Redis est corrompue", async () => {
    store.set(VENTES_KEY, "{ceci n'est pas du json");
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(503);
  });
  it("borne age_hours à 0 si generated_at est dans le futur (horloge du script en avance)", async () => {
    const futur = new Date(Date.now() + 5 * 3_600_000).toISOString();
    await post({ ...snapshot, generated_at: futur }, "s3cret");
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.age_hours).toBeGreaterThanOrEqual(0);
  });
});
