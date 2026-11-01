export const STATUS_FLAVOR: Record<string, string> = {
  idle: "staring at the wall. teach it a trade.",
  armed: "locked in. one tap from chaos (testnet chaos).",
  active: "in the trenches. funding rates fear this NFT.",
  paused: "touching grass. rare behavior for a degen agent.",
};

export const EMPTY_LINES = [
  "no agents yet — the desk is lonely and slightly judgmental.",
  "mint one before the charts start talking trash.",
  "zero NFTs. even the loading spinner looks disappointed.",
];

export const LOADING_LINES = [
  "bribing the sequencer with vibes…",
  "asking the NFT if it feels bullish…",
  "warming up TP/SL trigger fingers…",
  "checking if this is still testnet (yes)…",
];

export const ERR_PREFIX = [
  "oof.",
  "bruh moment:",
  "agent said nah:",
  "charts rejected that:",
];

export const SOLD_OUT_LINES = [
  "that's all she wrote — 100/100 agents hired. the HR dept is crying.",
  "sold out. the first 100 desks are full. try catching a transfer (or invent time travel).",
  "100/100. the printers stopped. even the faucet is judging latecomers.",
  "drop closed. every robot already has a boss. come back for season 2 (or a secondary).",
];

export const LOCKED_LINES = [
  "this desk is token-gated. no NFT, no orders — just vibes and FOMO.",
  "wallet connected, but your agent called in sick (you don't own one yet).",
  "mint your one-per-wallet agent to unlock the trading desk.",
];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
