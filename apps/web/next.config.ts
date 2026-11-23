import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  experimental: { typedRoutes: true },
  serverExternalPackages: ["postgres", "ioredis", "@okra-med/db", "drizzle-orm"],
};
export default config;
