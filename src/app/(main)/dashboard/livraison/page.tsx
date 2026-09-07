import LivraisonClient from "./LivraisonClient";

export const metadata = {
  title: "Livraison — elude-core dashboard",
  description: "Frais de port : qui les voit, qui repart, et ce qui reste bloqué à l'étape livraison (Medusa prod)",
};

/** Shell serveur : le fetch et l'UI vivent côté client, comme /paniers. */
export default function LivraisonPage() {
  return <LivraisonClient />;
}
