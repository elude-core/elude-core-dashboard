import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "elude-core ops",
  version: packageJson.version,
  copyright: `© ${currentYear}, elude SAS.`,
  meta: {
    title: "elude-core ops — Wynstor",
    description:
      "Dashboard d'opérations de la stack elude-core (Medusa, Payload, Coolify, n8n, Kuma, Prometheus, Sentry).",
  },
};
