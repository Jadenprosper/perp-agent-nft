import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@near-wallet-selector/core",
    "@near-wallet-selector/modal-ui",
    "@near-wallet-selector/meteor-wallet",
    "@near-wallet-selector/meteor-wallet-app",
    "@near-wallet-selector/my-near-wallet",
    "@near-wallet-selector/wallet-connect",
  ],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;
    // Only proxy when a real remote API is configured. Skip localhost on hosted deploys.
    if (!api || /127\.0\.0\.1|localhost/.test(api)) {
      return [];
    }
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
