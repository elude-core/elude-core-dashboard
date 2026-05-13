import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "elude-core",
  project: "dashboard",
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
