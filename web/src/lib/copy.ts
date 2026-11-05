export const STATUS_FLAVOR: Record<string, string> = {
  idle: "Staring At The Wall. Teach It A Trade.",
  armed: "Locked In. One Tap From Chaos (Testnet Chaos).",
  active: "In The Trenches. Funding Rates Fear This NFT.",
  paused: "Touching Grass. Rare Behavior For A Degen Agent.",
};

export const EMPTY_LINES = [
  "No Agents Yet — The Desk Is Lonely And Slightly Judgmental.",
  "Mint One Before The Charts Start Talking Trash.",
  "Zero NFTs. Even The Loading Spinner Looks Disappointed.",
];

export const LOADING_LINES = [
  "Bribing The Sequencer With Vibes…",
  "Asking The NFT If It Feels Bullish…",
  "Warming Up TP/SL Trigger Fingers…",
  "Checking If This Is Still Testnet (Yes)…",
];

export const ERR_PREFIX = [
  "Oof.",
  "Bruh Moment:",
  "Agent Said Nah:",
  "Charts Rejected That:",
];

export const SOLD_OUT_LINES = [
  "That's All She Wrote — 100/100 Agents Hired. The HR Dept Is Crying.",
  "Sold Out. The First 100 Desks Are Full. Try Catching A Transfer (Or Invent Time Travel).",
  "100/100. The Printers Stopped. Even The Faucet Is Judging Latecomers.",
  "Drop Closed. Every Robot Already Has A Boss. Come Back For Season 2 (Or A Secondary).",
];

export const LOCKED_LINES = [
  "This Desk Is Token-Gated. No NFT, No Orders — Just Vibes And FOMO.",
  "Wallet Connected, But Your Agent Called In Sick (You Don't Own One Yet).",
  "Mint Your One-Per-Wallet Bag Worker To Unlock The Trading Desk.",
];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
