import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@near-wallet-selector/modal-ui/styles.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-geist" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Perp Agent NFT — an NFT that trades",
  description:
    "NEP-171 agent NFTs for Hyperliquid perps (testnet). Own the NFT, own the bot. Built for NEAR HACKATHON.",
  openGraph: {
    title: "Perp Agent NFT",
    description: "The JPEG finally got a job: trading perps on testnet.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
