import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Faster cold compiles / smaller client bundles for icon + date libs
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
