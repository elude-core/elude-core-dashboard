import EventsClient from "./EventsClient";

export const metadata = {
  title: "Events — elude-core dashboard",
  description: "Timeline système : sync, orders, backups, alerts, deploys",
};

/**
 * Server component shell. Le fetch + UI se fait côté client pour permettre
 * filtres dynamiques + auto-refresh sans re-fetch SSR à chaque clic.
 */
export default function EventsPage() {
  return <EventsClient />;
}
