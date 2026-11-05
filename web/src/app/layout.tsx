import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";
import { Starfield } from "@/components/Starfield";
import "@near-wallet-selector/modal-ui/styles.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});
const display = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Bag Worker — An NFT That Trades",
  description:
    "NEP-171 Agent NFTs For Hyperliquid Perps (Testnet). Own The NFT, Own The Bot. Built For NEAR Hackathon.",
  openGraph: {
    title: "Bag Worker",
    description: "The JPEG Finally Got A Job: Trading Perps On Testnet.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0908",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="font-sans">
        <Starfield />
        {children}
      </body>
    </html>
  );
}
