import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FunnelPanel } from "@/components/elude/FunnelPanel";
import { useShopStats } from "@/hooks/useShopStats";
import type { ShopDayBrand } from "@/lib/shop-stats";

vi.mock("@/hooks/useShopStats", () => ({
  useShopStats: vi.fn(),
}));

const mockedUseShopStats = vi.mocked(useShopStats);

function jour(overrides: Partial<ShopDayBrand> = {}): ShopDayBrand {
  return {
    pageview: 0,
    add_to_cart: 0,
    add_to_quote: 0,
    quote_submitted: 0,
    cart_rate: 0,
    quote_rate: 0,
    quote_completion_rate: 0,
    ...overrides,
  };
}

describe("<FunnelPanel />", () => {
  it("distingue une lecture cassée (elude-sync down) d'un beacon silencieux", () => {
    // Amont injoignable / basicAuth faux, jamais eu de payload : SWR retombe
    // `isLoading: false` avec `data: undefined` et `error` peuplé. Le panneau
    // ne doit PAS afficher le message "vide" qui accuse le beacon storefront.
    mockedUseShopStats.mockReturnValue({
      data: undefined,
      error: new Error("shop-stats upstream: HTTP 503"),
      isLoading: false,
    } as unknown as ReturnType<typeof useShopStats>);

    render(<FunnelPanel />);

    expect(screen.getAllByText(/elude-sync/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/le beacon émet-il en prod/i)).not.toBeInTheDocument();
  });

  it("n'affiche pas « aucune donnée » quand panier/devis arrivent mais pas les pageviews", () => {
    // totals.pageview === 0 alors que des jours ont bien été reçus : c'est le
    // scénario d'une régression de l'émission `pageview` pendant que
    // add_to_cart/add_to_quote continuent d'arriver. Le vide doit se juger
    // sur le nombre de jours reçus, pas sur ce compteur précis.
    mockedUseShopStats.mockReturnValue({
      data: {
        data: {
          brands: ["wynstor"],
          days: {
            "20260821": {
              wynstor: jour({ pageview: 0, add_to_cart: 5, add_to_quote: 2, quote_submitted: 1 }),
            },
          },
          totals: jour({ pageview: 0, add_to_cart: 5, add_to_quote: 2, quote_submitted: 1 }),
        },
        stale: false,
      },
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useShopStats>);

    render(<FunnelPanel />);

    expect(screen.queryByText(/aucune donnée sur la période/i)).not.toBeInTheDocument();
    // "wynstor" apparaît deux fois (badge marque du header + libellé du
    // tableau) : la présence du tableau prouve que la branche "contenu"
    // s'est bien rendue, pas la branche "vide".
    expect(screen.getAllByText("wynstor").length).toBeGreaterThan(0);
  });

  it("affiche le bandeau stale quand fetchWithFallback sert un instantané périmé", () => {
    mockedUseShopStats.mockReturnValue({
      data: {
        data: {
          brands: ["wynstor"],
          days: {
            "20260821": { wynstor: jour({ pageview: 10, add_to_cart: 1, cart_rate: 10 }) },
          },
          totals: jour({ pageview: 10, add_to_cart: 1, cart_rate: 10 }),
        },
        stale: true,
        staleSince: 83_000,
        upstream: "shopstats",
      },
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useShopStats>);

    render(<FunnelPanel />);

    expect(screen.getByText(/shopstats unreachable/i)).toBeInTheDocument();
  });

  it("affiche « 0 % » sans décimale pour un taux nul, pas « 0,0 % »", () => {
    mockedUseShopStats.mockReturnValue({
      data: {
        data: {
          brands: ["wynstor"],
          days: {
            "20260821": {
              wynstor: jour({ pageview: 100, add_to_cart: 20, cart_rate: 20, quote_rate: 0, quote_completion_rate: 0 }),
            },
          },
          totals: jour({ pageview: 100, add_to_cart: 20, cart_rate: 20, quote_rate: 0, quote_completion_rate: 0 }),
        },
        stale: false,
      },
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useShopStats>);

    render(<FunnelPanel />);

    expect(screen.queryByText("0,0 %")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 %").length).toBeGreaterThan(0);
  });
});
