import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  transpilePackages: [
    "@content-engine/shared",
    "@content-engine/db",
    "@content-engine/media",
    "@content-engine/sora-provider"
  ]
};

export default nextConfig;
