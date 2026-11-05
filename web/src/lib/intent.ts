/** Lightweight client-side intent parser for the Trade chat (regex/keywords, no LLM). */
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
  | { kind: "help" }
  | { kind: "unknown" };

const num = (s: string) => Number(s.replace(/[$,]/g, ""));
function level(s?: string): Level | undefined {
  if (!s) return undefined;
  const m = s.match(/\$?([\d.,]+)\s*(%)?/);
  return m ? { value: num(m[1]), pct: Boolean(m[2]) } : undefined;
}

export function parseIntent(raw: string): Intent {
  const t = raw.trim().toLowerCase();
  if (!t) return { kind: "unknown" };
  if (/^(help|\?|commands|what can you do)/.test(t)) return { kind: "help" };
  if (/(status|how are we doing|how we doing|pnl|positions\??$|win rate)/.test(t)) return { kind: "status" };
  let m = t.match(/^(?:set\s+)?(?:leverage|lev)\s*(?:to|at|=)?\s*([\d.,]+)\s*x?\b/) || t.match(/^(?:use\s+)?([\d.,]+)\s*x\s*(?:leverage|lev)?$/);
  if (m) return { kind: "leverage", value: num(m[1]) };
  m = t.match(/max\s*(?:position\s*)?size\s*(?:to|at|=)?\s*\$?([\d.,]+)/);
  if (m) return { kind: "max_size", usd: num(m[1]) };
  m = t.match(/max\s*(?:daily\s*)?loss\s*(?:to|at|=)?\s*\$?([\d.,]+)/);
  if (m) return { kind: "max_loss", usd: num(m[1]) };
  m = t.match(/(?:set\s*)?(?:stop\s*loss|\bsl\b)\s*(?:at|to|=)?\s*(\$?[\d.,]+\s*%?)/);
  if (m && !/\b(long|short|buy|sell)\b/.test(t)) return { kind: "set_sl", level: level(m[1])! };
  m = t.match(/(?:set\s*)?(?:take\s*profit|\btp\b)\s*(?:at|to|=)?\s*(\$?[\d.,]+\s*%?)/);
  if (m && !/\b(long|short|buy|sell)\b/.test(t)) return { kind: "set_tp", level: level(m[1])! };
  if (/trade for me|run (the )?strategy|auto ?trade|do your thing/.test(t)) {
    const h = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
    return { kind: "trade_for_me", hours: h ? Number(h[1]) : /today/.test(t) ? "today" : null };
  }
  if (/^(pause|stop|stop trading|halt|chill)\b/.test(t)) return { kind: "pause" };
  if (/^(resume|start|continue|unpause|go)\b/.test(t)) return { kind: "resume" };
  m = t.match(/^close\s*(all|everything|[a-z]{2,6})?/);
  if (m) return { kind: "close", coin: !m[1] || /all|everything/.test(m[1]) ? null : m[1].toUpperCase() };
  m = t.match(/\b(long|short|buy|sell)\b\s*([a-z]{2,6})?\s*\$?([\d.,]+)?/);
  if (m) {
    const coin = m[2] && !["sl", "tp", "at", "for", "with"].includes(m[2]) ? m[2].toUpperCase() : null;
    const sl = t.match(/(?:sl|stop\s*loss)\s*(?:at)?\s*(\$?[\d.,]+\s*%?)/);
    const tp = t.match(/(?:tp|take\s*profit)\s*(?:at)?\s*(\$?[\d.,]+\s*%?)/);
    return { kind: "open", side: /long|buy/.test(m[1]) ? "long" : "short", coin, usd: m[3] ? num(m[3]) : null, sl: level(sl?.[1]), tp: level(tp?.[1]) };
  }
  return { kind: "unknown" };
}

export const CHAT_EXAMPLES = ["Trade For Me For 2h", "Long BTC 100 SL 2% TP 4%", "Confirm", "Cancel", "Set Stop Loss At 1.5%", "Status", "Close All", "Pause", "Set Max Daily Loss 200", "Set Leverage 50x", "Help"];
