/** Deterministic per-agent market + paper strategy config (token id → perp + params). */

export const PERPS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "AVAX", "LINK", "BNB", "NEAR", "AAVE"] as const;
export type Perp = (typeof PERPS)[number];

export type StrategyKind = "trend" | "breakout" | "meanrev";

export type StrategyConfig =
  | { kind: "trend"; label: string; fast: number; slow: number; riskPct: number; atrPeriod: number; tpAtr: number; slAtr: number }
  | { kind: "breakout"; label: string; lookback: number; riskPct: number; atrPeriod: number; tpAtr: number; slAtr: number }
  | { kind: "meanrev"; label: string; rsiPeriod: number; oversold: number; overbought: number; bbPeriod: number; bbStd: number; riskPct: number; atrPeriod: number; tpAtr: number; slAtr: number };

export type AgentConfig = { tokenId: number; market: Perp; interval: "1m"; strategy: StrategyConfig };

/** Small deterministic hash → [0,1) stream. */
function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const pickOf = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];

export function agentConfig(tokenId: number): AgentConfig {
  const id = Math.max(1, Math.trunc(tokenId));
  const r = rng(id + 7);
  const market = PERPS[(id - 1) % PERPS.length];
  const kinds: StrategyKind[] = ["trend", "breakout", "meanrev"];
  const kind = kinds[(id * 7 + Math.floor(r() * 3)) % 3];
  const riskPct = pickOf(r, [0.5, 0.75, 1, 1.25, 1.5, 2]);
  const atrPeriod = pickOf(r, [10, 14, 20]);
  const tpAtr = pickOf(r, [1.5, 2, 2.5, 3]);
  const slAtr = pickOf(r, [1, 1.25, 1.5]);
  let strategy: StrategyConfig;
  if (kind === "trend") {
    const fast = pickOf(r, [5, 8, 9, 12]);
    const slow = pickOf(r, [21, 26, 34, 50]);
    strategy = { kind, label: `Trend Following · EMA ${fast}/${slow} Cross`, fast, slow, riskPct, atrPeriod, tpAtr, slAtr };
  } else if (kind === "breakout") {
    const lookback = pickOf(r, [10, 20, 30, 55]);
    strategy = { kind, label: `Breakout · Donchian ${lookback}-Bar`, lookback, riskPct, atrPeriod, tpAtr, slAtr };
  } else {
    const rsiPeriod = pickOf(r, [7, 9, 14]);
    const oversold = pickOf(r, [25, 30]);
    const bbPeriod = pickOf(r, [20, 30]);
    const bbStd = pickOf(r, [2, 2.5]);
    strategy = { kind, label: `Mean Reversion · RSI ${rsiPeriod} + Bollinger ${bbPeriod}/${bbStd}`, rsiPeriod, oversold, overbought: 100 - oversold, bbPeriod, bbStd, riskPct, atrPeriod, tpAtr, slAtr };
  }
  return { tokenId: id, market, interval: "1m", strategy };
}

export function strategyParams(s: StrategyConfig): [string, string][] {
  const base: [string, string][] = [
    ["Risk Per Trade", `${s.riskPct}%`],
    ["ATR Period", String(s.atrPeriod)],
    ["Take Profit", `${s.tpAtr}× ATR`],
    ["Stop Loss", `${s.slAtr}× ATR`],
  ];
  if (s.kind === "trend") return [["Fast EMA", String(s.fast)], ["Slow EMA", String(s.slow)], ...base];
  if (s.kind === "breakout") return [["Lookback", `${s.lookback} Bars`], ...base];
  return [["RSI Period", String(s.rsiPeriod)], ["RSI Bands", `${s.oversold} / ${s.overbought}`], ["Bollinger", `${s.bbPeriod} · ${s.bbStd}σ`], ...base];
}
