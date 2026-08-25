import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cancerweb/graphql", "@cancerweb/validation"],
};

export default nextConfig;
