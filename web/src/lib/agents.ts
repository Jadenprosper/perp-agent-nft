import { withBase } from "@/lib/basePath";
/** Curated agent catalog from public/agents/metadata.json (shape may evolve). */

export type AgentCatalogTraits = Record<string, string>;

export type AgentCatalogEntry = {
  id: number;
  name: string;
  image: string;
  traits: AgentCatalogTraits;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function coerceTraits(raw: unknown): AgentCatalogTraits {
  const obj = asRecord(raw) || {};
  const out: AgentCatalogTraits = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}

/** Accept either a bare array or `{ agents: [...] }` / `{ items: [...] }`. */
export function normalizeAgentCatalog(raw: unknown): AgentCatalogEntry[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else {
    const obj = asRecord(raw);
    if (obj) {
      const nested = obj.agents ?? obj.items ?? obj.nfts ?? obj.collection;
      if (Array.isArray(nested)) list = nested;
    }
  }

  const out: AgentCatalogEntry[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const idNum = Number(row.id ?? row.token_id ?? row.tokenId);
    if (!Number.isFinite(idNum) || idNum < 1) continue;
    const id = Math.trunc(idNum);
    const name = String(row.name ?? row.title ?? `Bag Worker #${id}`);
    const image = String(
      row.image ?? row.image_url ?? row.media ?? `/gallery/bagworker-${String(id).padStart(3, "0")}.webp`
    );
    out.push({
      id,
      name,
      image: (image.startsWith("http") || image.startsWith("/")
        ? image
        : `/agents/${image}`)
        + (image.includes("?") ? "" : "?v=std2"),
      traits: coerceTraits(row.traits ?? row.attributes ?? {}),
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

export async function loadAgentCatalog(): Promise<AgentCatalogEntry[]> {
  const res = await fetch(withBase("/agents/metadata.json"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Catalog Failed (${res.status})`);
  const raw = await res.json();
  const list = normalizeAgentCatalog(raw);
  return list.map((a) => ({
    ...a,
    image: withBase(a.image.startsWith("/") ? a.image : `/${a.image}`),
  }));
}

export function traitEntries(traits: AgentCatalogTraits): [string, string][] {
  return Object.entries(traits).filter(([, v]) => Boolean(v && String(v).trim()));
}

export function titleCaseWords(s: string): string {
  return String(s || "")
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part)
        ? part
        : part
            .split("-")
            .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
            .join("-")
    )
    .join("");
}
