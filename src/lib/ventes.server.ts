import * as Sentry from "@sentry/nextjs";

import { redis } from "./redis";
import { isSnapshot, VENTES_KEY, type VentesSnapshot } from "./ventes";

/**
 * Délai maximal accordé à `redis.get` dans `readSnapshot()` — trois secondes suffisent
 * largement pour une lecture Redis locale. Volontairement LOCAL à cette fonction plutôt
 * qu'un `commandTimeout` posé sur le client partagé (`src/lib/redis.ts`, utilisé par toutes
 * les routes du dashboard) : durcir un client partagé en fin de chantier, sans pouvoir
 * éprouver ses autres consommateurs, déplacerait le risque au lieu de le réduire.
 */
export const VENTES_REDIS_TIMEOUT_MS = 3_000;

class DelaiRedisDepasse extends Error {}

export async function readSnapshot(): Promise<VentesSnapshot | null> {
  // Panne Redis elle-même (pas juste un contenu corrompu) : cette fonction ne doit JAMAIS
  // lever, ni rester indéfiniment en attente. Appelée depuis le rendu du composant serveur
  // de /dashboard/ventes (pas de error.tsx dans l'appli), une exception ici afficherait la
  // page d'erreur générique de Next au lieu de la bannière dégradée — régression introduite
  // en repassant `readSnapshot` du gestionnaire de route (qui, lui, encadre tout dans un
  // try/catch propre) au rendu SSR. Le client (`src/lib/redis.ts`) ne borne que l'établissement
  // TCP (`connectTimeout`) et les commandes mises en file avant connexion (`maxRetriesPerRequest`)
  // — rien sur une commande déjà envoyée : si Redis accepte la connexion puis ne répond jamais,
  // `redis.get` ne se résout jamais non plus. D'où la course avec un délai, ici seulement (pas
  // sur le client partagé par le reste du dashboard).
  let raw: string | null;
  try {
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    raw = await Promise.race([
      redis.get(VENTES_KEY).finally(() => clearTimeout(minuteur)),
      new Promise<never>((_resolve, reject) => {
        minuteur = setTimeout(
          () => reject(new DelaiRedisDepasse("ventes: redis.get au-delà du délai")),
          VENTES_REDIS_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { upstream: "ventes", cache_state: err instanceof DelaiRedisDepasse ? "timeout" : "unreachable" },
    });
    return null;
  }
  if (!raw) return null;

  // Entrée Redis tronquée ou corrompue (disque plein, écriture interrompue...) :
  // ne jamais laisser planter la route, retomber comme si rien n'avait encore été ingéré.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    Sentry.captureException(err, { tags: { upstream: "ventes", cache_state: "corrupt" } });
    return null;
  }

  if (!isSnapshot(parsed)) {
    Sentry.captureException(new Error("ventes:snapshot en cache ne respecte plus le contrat"), {
      tags: { upstream: "ventes", cache_state: "invalid" },
    });
    return null;
  }

  return parsed;
}
