/** Client-side intent parser for the Trade chat (rules + fuzzy matching, no LLM). */
export type Level = { value: number; pct: boolean };
export type Intent =
  | { kind: "trade_for_me"; hours: number | "today" | null }
  | { kind: "open"; side: "long" | "short"; coin: string | null; usd: number | null; sl?: Level; tp?: Level }
  | { kind: "set_sl"; level: Level }
  | { kind: "set_tp"; level: Level }
  | { kind: "close"; coin: string | null }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "status" }
  | { kind: "max_size"; usd: number }
  | { kind: "max_loss"; usd: number }
  | { kind: "leverage"; value: number }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "help" }
  | { kind: "unknown"; suggestion?: string };

const COINS: Record<string, string> = {
  btc: "BTC", bitcoin: "BTC", xbt: "BTC", eth: "ETH", ether: "ETH", ethereum: "ETH", sol: "SOL", solana: "SOL",
  hype: "HYPE", hyperliquid: "HYPE", xrp: "XRP", ripple: "XRP", doge: "DOGE", dogecoin: "DOGE", sui: "SUI",
  avax: "AVAX", avalanche: "AVAX", link: "LINK", chainlink: "LINK", bnb: "BNB", near: "NEAR", aave: "AAVE",
};

/** Canonical words the fuzzy matcher can snap typos onto. */
const VOCAB = [
  "close", "exit", "sell", "dump", "flatten", "liquidate", "everything", "position", "positions", "long", "short", "buy",
  "leverage", "stop", "loss", "take", "profit", "pause", "resume", "start", "status", "confirm", "cancel", "trade",
  "hours", "hour", "minutes", "minute", "dollars", "bucks", "maximum", "daily", "size", "help", "today", "percent",
  "bitcoin", "ethereum", "solana", "strategy", "running", "doing", "balance", "unpause", "continue",
];
function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}
/** Same letters, one swap ("clsoe" -> "close"). */
const swapped = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
};
const COMMON = new Set(["wake", "what", "with", "want", "make", "more", "some", "time", "this", "that", "then", "than", "them", "they", "your", "mine", "like", "lose", "lost", "safe", "save", "sure", "take", "tell", "show", "much", "many", "have", "from", "into", "over", "down", "doge", "link", "near", "back", "rest", "last", "best", "good", "nice", "okay", "work", "done", "give", "keep", "half"]);
function fix(w: string): string {
  if (w.length < 4 || /\d/.test(w) || VOCAB.includes(w) || COINS[w] || COMMON.has(w)) return w;
  for (const v of VOCAB) if (swapped(w, v)) return v;
  let best = w, bd = w.length >= 7 ? 2 : 1;
  for (const v of VOCAB) { if (Math.abs(v.length - w.length) > bd) continue; const d = lev(w, v); if (d < bd || (d === bd && best === w)) { if (d <= bd) { best = v; bd = d; } } }
  return best;
}

const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100 };

/** Lowercase, expand slang, fix typos. Exported for tests. */
export function normalize(raw: string): string {
  let t = ` ${raw.toLowerCase().replace(/[’']/g, "").replace(/[!?.,;]+(\s|$)/g, " ").replace(/\s+/g, " ").trim()} `;
  t = t.replace(/\s(\d+(?:\.\d+)?)\s*k\b/g, (_, n) => ` ${Number(n) * 1000} `);
  t = t.split(" ").map((w) => (w ? fix(w) : w)).join(" ");
  const rep: [RegExp, string][] = [
    [/\bhalf (an )?hour\b/g, "30 minutes"], [/\b(an|a|one) hour\b/g, "1 hours"],
    [/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/g, "$1 hours"], [/\b(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/g, "$1 minutes"],
    [/\b(\d+(?:\.\d+)?)\s*(percent|pct|per cent)\b/g, "$1%"],
    [/\b(\d[\d,]*(?:\.\d+)?)\s*(bucks|dollars|usd|usdc|dollar)\b/g, "$$$1"],
    [/\bs\s*\/\s*l\b|\bstoploss\b|\bstop-loss\b/g, "stop loss"], [/\bt\s*\/\s*p\b|\btakeprofit\b|\btake-profit\b/g, "take profit"],
    [/\bpls\b|\bplease\b|\bplz\b|\bkindly\b|\bcan you\b|\bcould you\b|\bi want to\b|\bi wanna\b|\blets\b|\bjust\b/g, " "],
  ];
  for (const [a, b] of rep) t = t.replace(a, b);
  t = t.replace(/\b(a|an|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety)\s+(hours|minutes)\b/g, (_, w, u) => `${WORDNUM[w]} ${u}`);
  return t.replace(/\s+/g, " ").trim();
}

const numOf = (s: string) => Number(s.replace(/[$,]/g, ""));
function levelAfter(t: string, re: RegExp): Level | undefined {
  const m = t.match(new RegExp(re.source + String.raw`\s*(?:at|to|of|=|@|:)?\s*(\$?\d[\d,]*(?:\.\d+)?)\s*(%)?`));
  return m ? { value: numOf(m[1]), pct: Boolean(m[2]) } : undefined;
}
/** Hours from "2 hours", "30 minutes", "1h30", or null. */
export function durationHours(t: string): number | null {
  const hm = t.match(/(\d+(?:\.\d+)?) hours?\s*(?:and\s*)?(\d+) minutes?/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const h = t.match(/(\d+(?:\.\d+)?) hours?\b/); if (h) return Number(h[1]);
  const m = t.match(/(\d+(?:\.\d+)?) minutes?\b/); if (m) return Number(m[1]) / 60;
  return null;
}
function coinIn(t: string): string | null {
  for (const w of t.split(/[^a-z]+/)) if (COINS[w]) return COINS[w];
  return null;
}
const SL_RE = /(?:stop\s*loss|\bsl\b|\bstop\b(?=\s*(?:at|to|of|=)?\s*\$?\d))/;
const TP_RE = /(?:take\s*profit|\btp\b|\btarget\b|\bprofit target\b)/;

export function parseIntent(raw: string): Intent {
  const t = normalize(raw);
  if (!t) return { kind: "unknown" };
  const has = (re: RegExp) => re.test(t);

  if (has(/^(confirm|confirmed|yes|y|yep|yeah|yup|ok|okay|sure|do it|send it|go ahead|lgtm|place it)\b/)) return { kind: "confirm" };
  if (has(/^(cancel|nevermind|never mind|nah|nope|no|forget it|scrap that|drop it|abort)\b/) && !has(/\b(stop loss|sl|tp|take profit)\b/)) return { kind: "cancel" };
  if (has(/^(help|\?|commands|menu|what can (you|i) (do|say)|how does this work|options)\b/) || /^(what can (you|i)|how do i use|what do you do)/.test(raw.trim().toLowerCase())) return { kind: "help" };

  // close / exit (before open so "sell everything" closes)
  const closeVerb = /\b(close|exit|get (me )?out|cash out|flatten|flat|dump|liquidate|unwind|kill (the )?(position|trade)s?|take (my )?profits?(?! *(?:at|to|of|=)? *\$?\d)|bail)\b/;
  const sellAll = /\bsell (it|all|everything|my|the|out|position|positions)\b/;
  if (has(closeVerb) || has(sellAll)) {
    if (!has(/\b(long|short|buy)\b.*\$?\d/) || has(/^(close|exit)\b/)) {
      return { kind: "close", coin: coinIn(t) };
    }
  }

  // stop the bot (but not "stop loss")
  if (has(/\b(pause|halt|chill|stand down|turn (it )?off|switch off|take a break|sleep)\b/) || (has(/\bstop\b/) && !has(SL_RE) && !has(/stop loss/))) {
    return { kind: "pause" };
  }

  let m = t.match(/\b(?:leverage|lev)\b\s*(?:to|at|of|=|on)?\s*(\d+(?:\.\d+)?)\s*x?/) || t.match(/\b(\d+(?:\.\d+)?)\s*x\b(?:\s*(?:leverage|lev))?/);
  if (m && !has(/\b(long|short|buy)\b/)) return { kind: "leverage", value: Number(m[1]) };

  m = t.match(/max(?:imum)?\s*(?:daily\s*)?(?:loss|drawdown)\s*(?:limit\s*)?(?:to|at|of|=)?\s*\$?(\d[\d,]*(?:\.\d+)?)/) || t.match(/(?:daily\s*)?loss\s*limit\s*(?:to|at|of|=)?\s*\$?(\d[\d,]*(?:\.\d+)?)/);
  if (m) return { kind: "max_loss", usd: numOf(m[1]) };
  m = t.match(/max(?:imum)?\s*(?:position\s*)?size\s*(?:to|at|of|=)?\s*\$?(\d[\d,]*(?:\.\d+)?)/);
  if (m) return { kind: "max_size", usd: numOf(m[1]) };

  const openSide = t.match(/\b(long|short|buy|sell|go long|go short|ape( into)?|bet on|bet against)\b/);
  if (!openSide) {
    const sl = levelAfter(t, SL_RE); if (sl && has(SL_RE)) return { kind: "set_sl", level: sl };
    const tp = levelAfter(t, TP_RE); if (tp) return { kind: "set_tp", level: tp };
  }

  if (has(/\b(trade for me|auto ?trade|run (it|the bot|the strategy|strategy|the agent)|do your thing|start trading|keep trading|work for|go to work|clock in|you trade|let it run|run for|trade (for|until))\b/)
      || (has(/\b(run|trade|work)\b/) && durationHours(t) != null)) {
    return { kind: "trade_for_me", hours: durationHours(t) ?? (has(/\btoday|rest of the day|all day\b/) ? "today" : null) };
  }
  if (!has(/^go (long|short)/) && has(/^(resume|start|continue|unpause|go|wake up|start the bot|start agent|turn (it )?on|back on)\b/) || has(/\b(start|resume|unpause) (the )?(bot|agent)\b/)) return { kind: "resume" };

  if (has(/\b(status|how (am i|are we|we|is it|it) doing|how.?s it going|pnl|p&l|profit and loss|positions?\b\??$|win rate|balance|equity|whats open|what do i have|am i up|am i down|update|report)\b/)) return { kind: "status" };

  if (openSide) {
    const w = openSide[1];
    const side: "long" | "short" = /short|sell|against/.test(w) ? "short" : "long";
    const sl = levelAfter(t, SL_RE), tp = levelAfter(t, TP_RE);
    const rest = t.replace(new RegExp(String.raw`(?:${SL_RE.source}|${TP_RE.source})\s*(?:at|to|of|=|@|:)?\s*\$?\d[\d,]*(?:\.\d+)?\s*%?`, "g"), " ")
      .replace(/\b\d+(?:\.\d+)?\s*x\b/g, " ");
    const um = rest.match(/\$(\d[\d,]*(?:\.\d+)?)/) || rest.match(/(?:with|for|of|size|margin|worth)\s*\$?(\d[\d,]*(?:\.\d+)?)/) || rest.match(/(?:^|\s)(\d[\d,]*(?:\.\d+)?)(?:\s|$)/);
    return { kind: "open", side, coin: coinIn(t), usd: um ? numOf(um[1]) : null, sl, tp };
  }
  return { kind: "unknown", suggestion: suggest(t) };
}

const SUGGEST: [string, string[]][] = [
  ["Close All", ["close", "exit", "out", "sell", "dump"]], ["Status", ["how", "doing", "pnl", "status", "balance"]],
  ["Trade For Me For 2h", ["trade", "run", "auto", "bot", "work"]], ["Pause", ["stop", "pause", "off"]],
  ["Long BTC 100 SL 2% TP 4%", ["long", "buy", "short", "open", "position"]], ["Set Leverage 20x", ["leverage", "lev", "x"]],
  ["Set Stop Loss At 2%", ["stop", "loss", "sl"]], ["Set Take Profit At 4%", ["take", "profit", "tp", "target"]],
  ["Set Max Daily Loss 200", ["max", "limit", "daily"]],
];
function suggest(t: string): string {
  const ws = t.split(" ");
  let best = "Help", score = 0;
  for (const [cmd, keys] of SUGGEST) { const s = keys.filter((k) => ws.includes(k)).length; if (s > score) { score = s; best = cmd; } }
  return best;
}

export const CHAT_EXAMPLES = ["Trade For Me For 2h", "Long BTC 100 SL 2% TP 4%", "Confirm", "Cancel", "Set Stop Loss At 1.5%", "Status", "Close All", "Pause", "Set Max Daily Loss 200", "Set Leverage 50x", "Help"];
