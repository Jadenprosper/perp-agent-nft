export type AgentTraits = {
  name: string;
  helm: string;
  body: string;
  gear: string;
  aura: string;
  catchphrase: string;
  seed: number;
  mood: string;
  performance_bps: number;
};

export type AgentConfig = {
  rules: string;
  status: string;
  hl_account: string | null;
  max_size: string;
  last_action: string | null;
  updated_at: number;
  traits?: AgentTraits | Record<string, unknown>;
};

export type AgentEvent = {
  at: number;
  kind: string;
  detail: string;
  by: string;
};

export type Nft = {
  token_id: string;
  owner_id: string;
  minter_id?: string;
  title: string;
  description: string;
  config: AgentConfig;
  history: AgentEvent[];
  portrait_svg?: string;
  portrait_url?: string;
};

export type MintStats = {
  minted: number;
  max_supply: number;
  remaining: number;
  sold_out: boolean;
  minted_ids?: string[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Request Failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  health: () =>
    req<{ ok: boolean; mode: string; vibe: string; mint: MintStats }>("/api/health"),
  mintStats: () => req<MintStats>("/api/mint-stats"),
  mintedIds: () =>
    req<{ minted_ids: string[] } & MintStats>("/api/minted-ids").catch(async () => {
      const s = await req<MintStats>("/api/mint-stats");
      return { ...s, minted_ids: s.minted_ids || [] };
    }),
  list: (owner?: string) =>
    req<{ nfts: Nft[]; mint: MintStats }>(
      owner ? `/api/nfts?owner=${encodeURIComponent(owner)}` : "/api/nfts"
    ),
  get: (id: string) => req<Nft>(`/api/nfts/${id}`),
  mint: (body: {
    owner_id: string;
    title?: string;
    rules?: string;
    max_size?: string;
    token_id?: number;
  }) =>
    req<{ ok: boolean; nft: Nft; toast: string; mint: MintStats }>("/api/nfts/mint", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  setRules: (
    id: string,
    body: { caller: string; rules: string; max_size?: string; status?: string }
  ) =>
    req<{ ok: boolean; nft: Nft; parsed: unknown; parse_error: string | null }>(
      `/api/nfts/${id}/rules`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  transfer: (id: string, body: { caller: string; receiver_id: string }) =>
    req<{ ok: boolean; nft: Nft; toast: string }>(`/api/nfts/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  execute: (id: string, body: { caller: string; size?: number; dry_run?: boolean }) =>
    req<{ ok: boolean; result: Record<string, unknown>; nft: Nft; toast: string }>(
      `/api/nfts/${id}/execute`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  parse: (text: string) =>
    req<{ ok: boolean; order: Record<string, unknown> }>("/api/parse", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
