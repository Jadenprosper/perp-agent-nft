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
    "Houston, We Printed The Bag.",
    "Leverage Said Yes And So Did The Charts.",
    "The NFT Just Paid Rent On The Moon.",
    "Funding Rates Filed A Missing Persons Report.",
  ],
  win: [
    "Stop-Loss Never Even Got Invited.",
    "Paper Hands Hate To See It.",
    "The Agent Ate. The Bag Stayed Crowned.",
    "Green Candles, Gold Chain Energy.",
  ],
  small_loss: [
    "This Is Fine. The Dumpster Is A Vibe.",
    "Down Bad, Still HODLing The Mug.",
    "Character Development, Not A Drawdown.",
    "Tiny Scar. Big Narrative Arc.",
  ],
  liquidated: [
    "Rekt Note Stuck To The Bag. Classic.",
    "The Exchange Said Goodbye First.",
    "Margin Called. Dignity Declined The Call.",
    "Zeroed With Style. See You At The Faucet.",
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
  const pnlPct = move * leverage * 100;
  const notional = entry * size;
  const margin = notional / Math.max(leverage, 1);
  const pnlUsd = margin * (pnlPct / 100);
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
    leverage: 10,
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
    "Perp Agent NFT — An NFT That Trades (NEAR Hackathon, Testnet)",
    "https://github.com/Jadenprosper/perp-agent-nft",
  ].join("\n");
}

export function xIntentUrl(text: string): string {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set("text", text);
  return u.toString();
}
