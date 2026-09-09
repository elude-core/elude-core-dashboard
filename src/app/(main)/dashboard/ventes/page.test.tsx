import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `readSnapshot` (src/lib/ventes.ts) n'encadrait pas l'appel à `redis.get` lui-même —
// seulement le JSON.parse et la validation de schéma. Tant qu'elle vivait dans le
// gestionnaire de route, une panne Redis donnait un 500 propre. Rendue directement par
// ce composant serveur (pas de error.tsx dans l'appli), l'exception y remontait telle
// quelle : page d'erreur générique de Next au lieu de la bannière dégradée.
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:6379");
    }),
    set: vi.fn(),
  },
}));

describe("VentesPage — panne Redis", () => {
  it("affiche la bannière dégradée plutôt que de laisser l'exception remonter", async () => {
    const { default: VentesPage } = await import("./page");
    const jsx = await VentesPage();
    render(jsx);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Aucun instantané lisible/)).toBeInTheDocument();
  });
});
