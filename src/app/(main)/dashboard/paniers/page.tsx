import PaniersClient from "./PaniersClient";

export const metadata = {
  title: "Paniers — elude-core dashboard",
  description: "Radio des paniers : étape atteinte, conversion par canal, liste filtrable (Medusa prod)",
};

/**
 * Server component shell. Le fetch + UI se fait côté client pour
 * permettre l'auto-refresh sans re-render SSR (même pattern que
 * sync-pipeline).
 */
export default function PaniersPage() {
  return <PaniersClient />;
}
