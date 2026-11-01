import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@near-wallet-selector/core",
    "@near-wallet-selector/modal-ui",
    "@near-wallet-selector/meteor-wallet",
    "@near-wallet-selector/my-near-wallet",
  ],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8787";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
