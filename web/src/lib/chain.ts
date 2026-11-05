/** Direct NEAR RPC view calls from the browser (no agent API needed). */
import { CONTRACT_ID, NETWORK_ID } from "@/lib/near";
import type { MintStats, Nft } from "@/lib/api";

const RPCS = (
  process.env.NEXT_PUBLIC_NEAR_RPC
    ? [process.env.NEXT_PUBLIC_NEAR_RPC]
    : NETWORK_ID === "mainnet"
      ? ["https://rpc.mainnet.near.org", "https://free.rpc.fastnear.com"]
      : ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"]
);

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export async function viewCall<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  let lastErr: unknown;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "pa", method: "query", params: {
          request_type: "call_function", finality: "final", account_id: CONTRACT_ID, method_name: method, args_base64: b64(JSON.stringify(args)) } }),
      });
      const data = await res.json();
      if (data.error || data.result?.error) {
        const msg = String(data.error?.data || data.error?.message || data.result?.error);
        // Contract-level errors are final; don't hop RPCs for them.
        if (/does not exist|MethodNotFound|panicked/i.test(msg)) throw Object.assign(new Error(msg), { final: true });
        throw new Error(msg);
      }
      return JSON.parse(new TextDecoder().decode(new Uint8Array(data.result.result))) as T;
    } catch (e) {
      lastErr = e;
      if ((e as { final?: boolean }).final) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RPC Failed");
}

type ChainToken = { token_id: string; owner_id: string; metadata?: { title?: string; description?: string } | null };

const toNft = (t: ChainToken): Nft => ({
  token_id: String(t.token_id), owner_id: t.owner_id, title: t.metadata?.title || `Agent #${t.token_id}`,
  description: t.metadata?.description || "",
  config: { rules: "", status: "idle", hl_account: null, max_size: "0.01", last_action: null, updated_at: 0 },
  history: [],
});

/** NEP-171 enumeration: every agent this wallet holds on the contract. */
export async function tokensForOwner(accountId: string): Promise<Nft[]> {
  const list = await viewCall<ChainToken[]>("nft_tokens_for_owner", { account_id: accountId, from_index: "0", limit: 100 });
  return list.map(toNft);
}

/** True when accountId owns tokenId (nft_token → owner_id compare). */
export async function ownsToken(accountId: string, tokenId: string | number): Promise<boolean> {
  const t = await viewCall<ChainToken | null>("nft_token", { token_id: String(tokenId) });
  return Boolean(t && t.owner_id === accountId);
}

export async function chainMintStats(): Promise<MintStats> {
  const [s, ids] = await Promise.all([
    viewCall<MintStats>("get_mint_stats"),
    viewCall<string[]>("get_minted_ids").catch(() => [] as string[]),
  ]);
  return { ...s, minted_ids: ids.map(String) };
}

/** Mint a chosen agent via the connected wallet (wallet-selector FunctionCall). */
export async function mintAgentTx(p: { token_id: number; rules?: string; max_size?: string }) {
  const { getSelector } = await import("@/lib/near");
  const selector = await getSelector();
  const wallet = await selector.wallet();
  const back = new URL(window.location.href);
  back.searchParams.set("minted", String(p.token_id));
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    callbackUrl: back.toString(),
    actions: [{ type: "FunctionCall", params: {
      methodName: "mint_agent",
      args: { token_id: p.token_id, rules: p.rules || null, max_size: p.max_size || null },
      gas: "100000000000000", // 100 Tgas
      deposit: "100000000000000000000000", // 0.1 NEAR; unused storage is refunded by the contract
    } }],
  } as Parameters<typeof wallet.signAndSendTransaction>[0]);
}

/** Pretty contract panic text ("Smart contract panicked: ..."). */
export function chainError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  const m = raw.match(/panicked: ([^"\\]+)/) || raw.match(/ExecutionError":"([^"]+)/);
  const msg = (m ? m[1] : raw).replace(/^Smart contract panicked: /, "");
  return msg.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 160);
}
