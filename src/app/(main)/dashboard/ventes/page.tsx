import { readSnapshot } from "@/lib/ventes.server";

import VentesClient from "./VentesClient";

export const metadata = {
  title: "Ventes — elude-core dashboard",
  description: "Ventes web et hors web par boutique, indices base 100, mesure figée post-migration storefront",
};

// La page lit Redis à chaque requête (instantané nocturne, ~1×/nuit) — jamais figée au build.
export const dynamic = "force-dynamic";

/**
 * Composant serveur : `readSnapshot()` est déjà une fonction serveur, appelée ici
 * directement plutôt que re-fetchée via `/api/ventes` (contrairement à paniers/events/
 * sync-pipeline, qui sont du temps réel — la donnée y bouge sous les yeux de l'utilisateur,
 * ce qui justifie leur fetch client. Un instantané nocturne ne change qu'une fois par nuit :
 * un aller-retour HTTP client-serveur-Redis n'apporterait rien, coûterait un flash
 * "Chargement…" à chaque ouverture et une revalidation SWR pour une donnée qui ne bouge pas).
 * `VentesClient` ne garde que l'état des filtres, du calcul pur sur des données déjà en mémoire.
 */
export default async function VentesPage() {
  const snapshot = await readSnapshot();

  if (!snapshot) {
    return <VentesClient snapshot={null} ageHours={null} />;
  }

  // Même formule que GET /api/ventes (src/app/api/ventes/route.ts) : generated_at est
  // validé par isSnapshot (readSnapshot), jamais NaN ici. Borné à 0 par le bas : une
  // horloge de script en avance ne doit pas rendre un âge négatif.
  const age = (Date.now() - Date.parse(snapshot.generated_at)) / 3_600_000;
  const ageHours = Math.max(0, Math.round(age * 10) / 10);

  return <VentesClient snapshot={snapshot} ageHours={ageHours} />;
}
