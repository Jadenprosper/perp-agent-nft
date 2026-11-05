import type { Candle } from "@/lib/hl";
import type { StrategyConfig } from "@/lib/agentConfig";

/** Paper position (agent or manual). Mirrors agent/ rule shape: side + entry + TP/SL. */
/** "agent-auto" = opened by the strategy loop; "you"/"manual" = the holder. "agent" is legacy (pre split). */
export type Owner = "agent-auto" | "you" | "manual" | "agent";
export type Position = { id: string; side: "long" | "short"; size: number; entry: number; tp?: number; sl?: number; openedAt: number; by: Owner; lev?: number };
export type PendingOrder = { id: string; side: "long" | "short"; size: number; limit: number; tp?: number; sl?: number; createdAt: number; lev?: number };
export type Fill = { id: string; side: "long" | "short"; size: number; entry: number; exit: number; pnl: number; openedAt: number; closedAt: number; by: Owner; reason: string; lev?: number };
export type Decision = { time: number; text: string };

export function ema(vals: number[], p: number): number[] {
  const k = 2 / (p + 1); const out: number[] = []; let prev = vals[0];
  vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); });
  return out;
}
export function atr(c: Candle[], p: number): number {
  if (c.length < p + 1) return 0;
  let s = 0;
  for (let i = c.length - p; i < c.length; i++) {
    const pc = c[i - 1].close;
    s += Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc));
  }
  return s / p;
}
export function rsi(vals: number[], p: number): number {
  if (vals.length < p + 1) return 50;
  let g = 0, l = 0;
  for (let i = vals.length - p; i < vals.length; i++) { const d = vals[i] - vals[i - 1]; if (d > 0) g += d; else l -= d; }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}
const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(4));

export type Signal = { action: "long" | "short" | "close" | null; reason: string };

/** Evaluate on CLOSED candles only. `pos` = current agent position side, if any. */
export function evaluate(s: StrategyConfig, closed: Candle[], pos: "long" | "short" | null): Signal {
  const closes = closed.map((c) => c.close);
  const last = closes[closes.length - 1];
  if (s.kind === "trend") {
    if (closes.length < s.slow + 2) return { action: null, reason: "" };
    const f = ema(closes, s.fast), sl = ema(closes, s.slow);
    const n = closes.length - 1;
    const up = f[n - 1] <= sl[n - 1] && f[n] > sl[n];
    const dn = f[n - 1] >= sl[n - 1] && f[n] < sl[n];
    if (up) return { action: pos === "short" ? "close" : pos ? null : "long", reason: `EMA ${s.fast} Crossed Above EMA ${s.slow}${pos === "short" ? ", Closing Short" : ", Long"}` };
    if (dn) return { action: pos === "long" ? "close" : pos ? null : "short", reason: `EMA ${s.fast} Crossed Below EMA ${s.slow}${pos === "long" ? ", Closing Long" : ", Short"}` };
    return { action: null, reason: "" };
  }
  if (s.kind === "breakout") {
    if (closed.length < s.lookback + 2) return { action: null, reason: "" };
    const win = closed.slice(-s.lookback - 1, -1);
    const hi = Math.max(...win.map((c) => c.high)), lo = Math.min(...win.map((c) => c.low));
    if (last > hi && pos !== "long") return { action: pos ? "close" : "long", reason: `Close ${fmt(last)} Broke ${s.lookback}-Bar High ${fmt(hi)}${pos ? ", Closing Short" : ", Long"}` };
    if (last < lo && pos !== "short") return { action: pos ? "close" : "short", reason: `Close ${fmt(last)} Broke ${s.lookback}-Bar Low ${fmt(lo)}${pos ? ", Closing Long" : ", Short"}` };
    return { action: null, reason: "" };
  }
  if (closes.length < Math.max(s.bbPeriod, s.rsiPeriod) + 2) return { action: null, reason: "" };
  const w = closes.slice(-s.bbPeriod);
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
  const upper = mean + s.bbStd * sd, lower = mean - s.bbStd * sd;
  const r = rsi(closes, s.rsiPeriod);
  if (pos === "long" && last >= mean) return { action: "close", reason: `Price Back At Bollinger Mid ${fmt(mean)}, Closing Long` };
  if (pos === "short" && last <= mean) return { action: "close", reason: `Price Back At Bollinger Mid ${fmt(mean)}, Closing Short` };
  if (!pos && r < s.oversold && last < lower) return { action: "long", reason: `RSI ${s.rsiPeriod} At ${r.toFixed(1)} Below ${s.oversold} + Under Lower Band, Long` };
  if (!pos && r > s.overbought && last > upper) return { action: "short", reason: `RSI ${s.rsiPeriod} At ${r.toFixed(1)} Above ${s.overbought} + Over Upper Band, Short` };
  return { action: null, reason: "" };
}

/** Margin = entry * size (the ticket size is margin, same number the max size guard checks). */
export const margin = (p: Position) => p.entry * p.size;
/** Leveraged uPnL = price move * size * leverage, floored at -margin (a loss can't exceed what was posted). */
export const upnl = (p: Position, px: number) =>
  Math.max(-margin(p), (p.side === "long" ? px - p.entry : p.entry - px) * p.size * (p.lev ?? 1));
/** Liquidation price: where loss hits 100% of margin, i.e. an adverse move of entry / leverage. */
export const liqPx = (p: Position) => p.entry * (p.side === "long" ? 1 - 1 / (p.lev ?? 1) : 1 + 1 / (p.lev ?? 1));
export const isLiquidated = (p: Position, px: number) => (p.side === "long" ? px <= liqPx(p) : px >= liqPx(p));
export { fmt as fmtPx };
