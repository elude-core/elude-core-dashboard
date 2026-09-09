import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VENTES_REDIS_TIMEOUT_MS } from "@/lib/ventes.server";

// `readSnapshot` (src/lib/ventes.server.ts) n'encadrait pas l'appel à `redis.get` lui-même —
// seulement le JSON.parse et la validation de schéma. Tant qu'elle vivait dans le
// gestionnaire de route, une panne Redis donnait un 500 propre. Rendue directement par
// ce composant serveur (pas de error.tsx dans l'appli), l'exception y remontait telle
// quelle : page d'erreur générique de Next au lieu de la bannière dégradée.
// Deux modes de panne distincts, contrôlés par `mode` : connexion refusée (rejet immédiat)
// et Redis qui accepte la connexion puis ne répond jamais (aucune résolution) — le second
// est le plus vicieux, il ne produit aucun message sans une borne applicative dédiée.
let mode: "reject" | "never" | "ok" = "ok";

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(() => {
      if (mode === "reject") return Promise.reject(new Error("ECONNREFUSED 127.0.0.1:6379"));
      if (mode === "never") {
        // Ne se résout ni ne rejette jamais — simule Redis qui accepte la connexion et se tait.
        return new Promise(() => {
          /* volontairement vide */
        });
      }
      return Promise.resolve(null);
    }),
    set: vi.fn(),
  },
}));

beforeEach(() => {
  mode = "ok";
});

describe("VentesPage — pannes Redis", () => {
  it("connexion refusée : affiche la bannière dégradée plutôt que de laisser l'exception remonter", async () => {
    mode = "reject";
    const { default: VentesPage } = await import("./page");
    const jsx = await VentesPage();
    render(jsx);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Aucun instantané lisible/)).toBeInTheDocument();
  });

  it("Redis accepte la connexion et ne répond jamais : la borne de readSnapshot() produit la bannière, pas un rendu suspendu", async () => {
    vi.useFakeTimers();
    try {
      mode = "never";
      const { default: VentesPage } = await import("./page");
      const rendu = VentesPage();
      // Horloge simulée : pas d'attente réelle de VENTES_REDIS_TIMEOUT_MS pendant les tests.
      await vi.advanceTimersByTimeAsync(VENTES_REDIS_TIMEOUT_MS + 500);
      const jsx = await rendu;
      render(jsx);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Aucun instantané lisible/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
