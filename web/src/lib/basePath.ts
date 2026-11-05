/** Prefix public asset paths when the static export lives under /perp-agent-nft. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export function withBase(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const v = /\.(jpe?g|png|webp)$/i.test(p) && !p.includes("?") ? "?v=std2" : "";
  return `${BASE_PATH}${p}${v}`;
}
