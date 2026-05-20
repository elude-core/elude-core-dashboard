import SyncPipelineClient from "./SyncPipelineClient";

export const metadata = {
  title: "Sync Pipeline — elude-core dashboard",
  description: "Santé du pipeline Akeneo → Medusa → Payload → Meili → Storefront",
};

/**
 * Server component shell. Le fetch + UI se fait côté client pour
 * permettre l'auto-refresh sans re-render SSR.
 */
export default function SyncPipelinePage() {
  return <SyncPipelineClient />;
}
