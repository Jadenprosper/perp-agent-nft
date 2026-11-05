/** Shared leverage setting: Trade page writes it, PnL share card reads it. */
export const MAX_LEVERAGE = 100;
export const MIN_LEVERAGE = 1;
export const DEFAULT_LEVERAGE = 100;
export const LEV_EVENT = "pa:leverage";

/** Clamp to an integer in [1, 100]; junk falls back to the default. */
export function clampLeverage(v: unknown, fallback = DEFAULT_LEVERAGE): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_LEVERAGE, Math.max(MIN_LEVERAGE, n));
}
const k = (tokenId: number | string) => `pa:leverage:${tokenId}`;
export function readLeverage(tokenId: number | string): number {
  if (typeof window === "undefined") return DEFAULT_LEVERAGE;
  try { const raw = localStorage.getItem(k(tokenId)); return raw == null ? DEFAULT_LEVERAGE : clampLeverage(raw); } catch { return DEFAULT_LEVERAGE; }
}
export function writeLeverage(tokenId: number | string, lev: number) {
  const v = clampLeverage(lev);
  try { localStorage.setItem(k(tokenId), String(v)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(LEV_EVENT, { detail: { tokenId: String(tokenId), lev: v } }));
}
