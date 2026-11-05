import { clampLeverage } from "@/lib/leverage";
/** Shareable PnL card tiers + copy. */

export type PnlTier = "moon" | "win" | "small_loss" | "liquidated";

export type PnlSide = "long" | "short";

export type PnlSnapshot = {
  agentName: string;
  tokenId: string;
  market: string;
  side: PnlSide;
  leverage: number;
  entry: number;
  exit: number;
  /** PnL percent on margin (after leverage). */
  pnlPct: number;
  /** Notional $ PnL for display. */
  pnlUsd: number;
  liquidated?: boolean;
  size?: number;
};

export const TIER_SCENES: Record<PnlTier, { src: string; label: string; accent: string }> = {
  moon: {
    src: "/pnl-scenes/moon.jpg",
    label: "To The Moon",
    accent: "#b8ff3c",
  },
  win: {
    src: "/pnl-scenes/win.jpg",
    label: "Big Win",
    accent: "#00d4aa",
  },
  small_loss: {
    src: "/pnl-scenes/small-loss.jpg",
    label: "This Is Fine",
    accent: "#ffb020",
  },
  liquidated: {
    src: "/pnl-scenes/liquidated.jpg",
    label: "Liquidated",
    accent: "#ff4d9a",
  },
};

const ONE_LINERS: Record<PnlTier, string[]> = {
  moon: [
    "Quitting My Job. Not Joking This Time.",
    "Told You Guys. Nobody Listened.",
    "Lambo Dealership Hasn't Called Back Yet.",
    "Screenshot Before It Goes Back Down.",
  ],
  win: [
    "Small Win But I'm Telling Everyone.",
    "Took Profit For Once. Proud Of Me.",
    "Rent Paid. Back To Gambling.",
    "Up Only Until I Check Again.",
  ],
  small_loss: [
    "It's Fine. I'm Fine. Everything's Fine.",
    "Not A Loss If You Don't Look At It.",
    "Down A Bit. Still Smarter Than You.",
    "Just A Flesh Wound. Adding More.",
  ],
  liquidated: [
    "Wendy's Is Hiring. I Checked.",
    "Max Leverage, Min Brain Cells.",
    "Sold The Bottom Like A Pro.",
    "Should've Just Bought And Slept.",
  ],
};

export function pickOneLiner(tier: PnlTier, seed = 0): string {
  const list = ONE_LINERS[tier];
  return list[Math.abs(seed) % list.length];
}

/** Tier from PnL % (on margin). Liquidated flag wins. */
export function tierFromPnl(pnlPct: number, liquidated = false): PnlTier {
  if (liquidated || pnlPct <= -80) return "liquidated";
  if (pnlPct >= 100) return "moon";
  if (pnlPct > 0) return "win";
  return "small_loss";
}

/** Compute PnL % and $ from entry/exit/side/leverage/size. */
export function computePnl(opts: {
  side: PnlSide;
  entry: number;
  exit: number;
  leverage: number;
  size: number; // coin size
  markPrice?: number;
}): { pnlPct: number; pnlUsd: number } {
  const { side, entry, exit, leverage, size } = opts;
  if (!entry || !exit || !size) return { pnlPct: 0, pnlUsd: 0 };
  const dir = side === "long" ? 1 : -1;
  const move = ((exit - entry) / entry) * dir;
  const lev = clampLeverage(leverage);
  const pnlPct = Math.max(-100, move * lev * 100);
  // Same model as the Trade page: size * entry = margin, PnL = move * size * leverage,
  // floored at -100% of margin (liquidation).
  const margin = entry * size;
  const pnlUsd = Math.max(-margin, margin * move * lev);
  return { pnlPct, pnlUsd };
}

/** Best-effort parse of market/side/entry from plain-english rules. */
export function guessTradeFromRules(rules: string): Partial<PnlSnapshot> {
  const t = rules || "";
  const side: PnlSide = /\bshort\b/i.test(t) ? "short" : "long";
  const m =
    t.match(/\b(BTC|ETH|SOL|ARB|OP|DOGE|WIF|PEPE|NEAR|BNB|AVAX|SUI|TIA|INJ)\b/i)?.[1] ||
    "ETH";
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => Number(x[1]));
  const entry = nums[0] || 0;
  // prefer TP as exit for share mock if present
  const tp = t.match(/\bTP\s*[=:]?\s*(\d+(?:\.\d+)?)/i)?.[1];
  const sl = t.match(/\bSL\s*[=:]?\s*(\d+(?:\.\d+)?)/i)?.[1];
  const exit = tp ? Number(tp) : sl ? Number(sl) : entry ? entry * (side === "long" ? 1.05 : 0.95) : 0;
  return {
    market: m.toUpperCase(),
    side,
    entry,
    exit,
  };
}

export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const body =
    abs >= 1000 ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 }) : abs.toFixed(2);
  return `${sign}$${body}`;
}

export function buildShareText(s: PnlSnapshot, tier: PnlTier, line: string): string {
  const scene = TIER_SCENES[tier];
  return [
    `${scene.label}: ${s.agentName} (#${s.tokenId})`,
    `${s.side.toUpperCase()} ${s.market} · ${s.leverage}x`,
    `${formatPct(s.pnlPct)} · ${formatUsd(s.pnlUsd)}`,
    `"${line}"`,
    "",
    "Bag Worker - An NFT That Trades (NEAR Hackathon, Testnet)",
    "https://github.com/Jadenprosper/perp-agent-nft",
  ].join("\n");
}

export function xIntentUrl(text: string): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set("text", text);
  return u.toString();
}
