import VentesClient from "./VentesClient";

export const metadata = {
  title: "Ventes — elude-core dashboard",
  description: "Ventes web et hors web par boutique, indices base 100, mesure figée post-migration storefront",
};

/**
 * Server component shell. Le fetch + UI se fait côté client (comme paniers,
 * events, sync-pipeline) pour permettre le filtre boutique et l'auto-refresh
 * sans re-render SSR à chaque clic.
 */
export default function VentesPage() {
  return <VentesClient />;
}
