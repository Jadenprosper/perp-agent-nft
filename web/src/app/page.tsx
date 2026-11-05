"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, CandlestickChart, FlaskConical, Github, LayoutGrid, Terminal } from "lucide-react";
import { AgentCard } from "@/components/AgentCard";
import { AgentDesk } from "@/components/AgentDesk";
import { MintPanel } from "@/components/MintPanel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TradeView } from "@/components/TradeView";
import { SupplyCounter } from "@/components/SupplyCounter";
import { ToastStack, type ToastItem } from "@/components/Toast";
import { WalletButton } from "@/components/WalletButton";
import { api, type MintStats, type Nft } from "@/lib/api";
import { EMPTY_LINES, ERR_PREFIX, LOADING_LINES, pick } from "@/lib/copy";
import { getModal } from "@/lib/near";
import { chainError, chainMintStats, mintAgentTx, tokensForOwner } from "@/lib/chain";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

const TICKER = [
  "100 Agent Desks · One Per Wallet",
  "Plain English → TP / SL",
  "Transfer The NFT · Transfer The Bot",
  "Hyperliquid Testnet Only",
  "NEAR Hackathon · NFTs That Do Something",
  "No Mainnet Keys Were Harmed",
  "Sold Out? Bribe A Friend",
  "The JPEG Finally Got A Job",
];

export default function HomePage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mine, setMine] = useState<Nft[]>([]);
  const [gallery, setGallery] = useState<Nft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<MintStats | null>(null);
  const [mintedIds, setMintedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("dry_run");
  const [vibe, setVibe] = useState("Booting…");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [emptyLine] = useState(() => pick(EMPTY_LINES));
  const [loadingLine] = useState(() => pick(LOADING_LINES));
  const [view, setViewRaw] = useState<"desk" | "mint" | "trade">(() => {
    if (typeof window === "undefined") return "desk";
    const q = new URLSearchParams(window.location.search).get("view");
    return q === "mint" || q === "desk" || q === "trade" ? q : "desk";
  });
  const [tradeId, setTradeId] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const n = Number(new URLSearchParams(window.location.search).get("agent"));
    return n >= 1 && n <= 100 ? Math.trunc(n) : 1;
  });
  const setView = useCallback((v: "desk" | "mint" | "trade", agent?: number) => {
    setViewRaw(v);
    if (agent) setTradeId(agent);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("view", v);
      if (v === "trade") u.searchParams.set("agent", String(agent ?? tradeIdRef.current));
      else u.searchParams.delete("agent");
      window.history.replaceState(null, "", u.toString());
    }
  }, []);

  const tradeIdRef = useRef(tradeId);
  tradeIdRef.current = tradeId;

  const pushToast = useCallback((text: string, kind: ToastItem["kind"] = "ok") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const onError = useCallback(
    (msg: string) => pushToast(`${pick(ERR_PREFIX)} ${msg}`, "err"),
    [pushToast]
  );

  const refresh = useCallback(async () => {
    // Ownership always comes straight from the NEAR contract (browser RPC view call).
    let owned: Nft[] = [];
    let chainOk = true;
    if (accountId) {
      try {
        owned = await tokensForOwner(accountId);
      } catch (e) {
        chainOk = false;
        console.warn("Chain Ownership Check Failed", e);
      }
    }
    try {
      if (IS_STATIC) {
        // Static GitHub Pages build: no agent API calls at all.
        const mint = await chainMintStats().catch(() => null);
        if (mint) setStats(mint);
        setMintedIds(mint?.minted_ids || []);
        setGallery(owned);
        setMode("dry_run");
        setVibe(chainOk ? "Reading Ownership Straight From NEAR Testnet" : "NEAR RPC Unreachable, Retrying");
      } else {
        const [all, health] = await Promise.all([api.list(), api.health()]);
        setGallery(all.nfts);
        const mint = all.mint || health.mint;
        setStats(mint);
        const fromStats = (mint as MintStats).minted_ids || [];
        const fromGallery = all.nfts.map((n) => String(n.token_id));
        setMintedIds(Array.from(new Set([...fromStats, ...fromGallery])));
        setMode(health.mode);
        setVibe(String(health.vibe || "").replace(/\b\w/g, (c) => c.toUpperCase()) || "Online");
        // Enrich on-chain holdings with API config/history (Desk rules) when available.
        owned = owned.map((n) => all.nfts.find((x) => x.token_id === n.token_id) || n);
      }
    } catch (e) {
      setMintedIds([]);
      const msg = e instanceof Error ? e.message : "Backend Ghosted Us";
      if (!/failed \(404\)|failed to fetch|networkerror/i.test(msg)) onError(msg);
    } finally {
      setMine(owned);
      setSelectedId((cur) => {
        if (cur && owned.some((n) => n.token_id === cur)) return cur;
        if (owned[0]) return owned[0].token_id;
        return null;
      });
      setLoading(false);
    }
  }, [accountId, onError]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const t = setInterval(() => {
      void (IS_STATIC ? chainMintStats() : api.mintStats())
        .then((s) => {
          setStats(s);
          if (s.minted_ids) setMintedIds(s.minted_ids.map(String));
        })
        .catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = useMemo(
    () => mine.find((n) => n.token_id === selectedId) || null,
    [mine, selectedId]
  );

  async function onMint(payload: { rules: string; max_size: string; token_id: number }) {
    if (!accountId) return;
    setBusy(true);
    try {
      // Direct on-chain mint through the connected wallet (Meteor etc.). No API.
      await mintAgentTx(payload);
      pushToast(`Agent #${payload.token_id} Minted On-Chain`);
      await afterMint(String(payload.token_id));
    } catch (e) {
      const msg = chainError(e);
      if (/reject|cancel|closed/i.test(msg)) pushToast("Mint Cancelled In Wallet", "err");
      else onError(msg || "Mint Failed");
      void chainMintStats().then(setStats).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function afterMint(id: string) {
    // RPC finality lags a moment; poll ownership until the token shows up.
    for (let i = 0; i < 6; i++) {
      await refresh();
      if (accountId && (await tokensForOwner(accountId).catch(() => [])).some((n) => n.token_id === id)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await refresh();
    setSelectedId(id);
    setView("desk");
  }

  // Redirect-wallet return: ?transactionHashes=... or ?errorCode=...
  useEffect(() => {
    if (!accountId || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const hashes = u.searchParams.get("transactionHashes");
    const err = u.searchParams.get("errorCode");
    const minted = u.searchParams.get("minted");
    if (!hashes && !err) return;
    ["transactionHashes", "errorCode", "errorMessage", "minted"].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(null, "", u.toString());
    if (err) {
      pushToast(err === "userRejected" ? "Mint Cancelled In Wallet" : `Wallet Error: ${err}`, "err");
    } else {
      pushToast(`Mint Confirmed — Tx ${hashes!.slice(0, 8)}…`);
      if (minted) void afterMint(minted);
      else void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function onUpdated(n: Nft) {
    setMine((list) => list.map((x) => (x.token_id === n.token_id ? n : x)));
    setGallery((list) => list.map((x) => (x.token_id === n.token_id ? n : x)));
  }

  async function onConnect() {
    const modal = await getModal();
    modal.show();
  }

  const tickerText = [...TICKER, ...TICKER].join("  ·  ");

  return (
    <div className="relative min-h-screen">
      <LoadingScreen dataReady={!loading} />
      {/* ticker — papertrade energy */}
      <div className="overflow-hidden border-b border-brown-400/15 bg-ink-900/95">
        <div className="ticker-track flex whitespace-nowrap py-1.5 font-mono text-[10px] tracking-micro text-brown-300/80">
          <span className="px-4">{tickerText}</span>
          <span className="px-4" aria-hidden>
            {tickerText}
          </span>
        </div>
      </div>

      {/* top nav — bulk density */}
      <header className="sticky top-0 z-40 border-b border-brown-400/15 bg-ink-950/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2.5 sm:px-4">
          <a href="#" className="group flex shrink-0 items-baseline gap-0.5">
            <span className="font-display text-lg font-semibold tracking-tight text-cream sm:text-xl">
              Perp Agent
            </span>
            <span className="cursor-blink font-mono text-brown-400">_</span>
          </a>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {(
              [
                ["desk", "Desk", Terminal],
                ["mint", "Mint", LayoutGrid],
                ["trade", "Trade", CandlestickChart],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id, id === "trade" && selectedId ? Number(selectedId) : undefined)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  view === id
                    ? "bg-brown-500/20 text-brown-200"
                    : "text-cream-mute hover:bg-ink-800 hover:text-cream-dim"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="chip chip-live hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brown-400" />
              Live · Testnet
            </span>
            <span className="chip hidden lg:inline-flex">
              <FlaskConical size={10} /> {String(mode || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—"}
            </span>
            <a
              className="btn-bracket hidden px-2 py-1.5 sm:inline-flex"
              href="https://github.com/Jadenprosper/perp-agent-nft"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={12} /> Repo
            </a>
            <WalletButton accountId={accountId} onChange={setAccountId} />
          </div>
        </div>

        {/* mobile view switch */}
        <div className="flex gap-1 border-t border-brown-400/10 px-3 py-1.5 md:hidden">
          {(
            [
              ["desk", "Desk"],
              ["mint", "Mint"],
              ["trade", "Trade"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id, id === "trade" && selectedId ? Number(selectedId) : undefined)}
              className={`flex-1 rounded-md py-1.5 font-mono text-[11px] tracking-micro ${
                view === id
                  ? "bg-brown-500/25 text-brown-200"
                  : "text-cream-mute"
              }`}
            >
              [ {label} ]
            </button>
          ))}
        </div>
      </header>

      {/* stats strip */}
      <div className="border-b border-brown-400/10 bg-ink-900/60">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 sm:px-4">
          <SupplyCounter stats={stats} compact />
          <div className="hidden h-4 w-px bg-brown-400/20 sm:block" />
          <p className="hidden text-xs text-cream-mute sm:block">
            First Drop ·{" "}
            <span className="text-brown-300">{stats?.remaining ?? "—"}</span> Seats Left · One Agent /
            Wallet
          </p>
          <p className="ml-auto truncate font-mono text-[10px] text-cream-mute/70">{vibe}</p>
        </div>
      </div>

      {view === "trade" ? (
        <TradeView
          tokenId={tradeId}
          accountId={accountId}
          isHolder={mine.some((n) => String(n.token_id) === String(tradeId))}
          onConnect={onConnect}
          onBack={() => setView("mint")}
        />
      ) : view === "mint" ? (
        <main className="mx-auto max-w-[1400px]">
          <div className="terminal-scroll p-3 sm:p-4 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label-micro">Hire Desk</p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream sm:text-3xl">
                  The NFT Got A Job
                </h1>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-cream-mute sm:text-sm">
                  Mint One Of <span className="text-brown-300">100</span> Unique Agents. Pick The Face
                  You Want On The Desk. Write Trades In Plain English. Transfer The NFT — The Bot
                  Clocks In For The New Owner.
                </p>
              </div>
              <button
                className="chip hover:bg-brown-500/20"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                <Activity size={11} /> Refresh
              </button>
            </div>

            <MintPanel
              owner={accountId}
              busy={busy}
              stats={stats}
              alreadyMinted={mine.length > 0}
              mintedIds={mintedIds}
              onMint={onMint}
              onConnect={onConnect}
              onTrade={(id) => setView("trade", id)}
              expanded
            />
          </div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-12">
          {/* left rail */}
          <aside className="terminal-scroll border-brown-400/10 lg:col-span-4 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:border-r">
            <div className="space-y-0 p-3 sm:p-4">
              <div className="mb-3 flex items-end justify-between px-0.5">
                <div>
                  <p className="label-micro">Your Roster</p>
                  <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream">
                    Agent Desk
                  </h1>
                </div>
                <button
                  className="chip hover:bg-brown-500/20"
                  onClick={() => setView("mint")}
                >
                  <LayoutGrid size={11} /> Mint
                </button>
              </div>

              <p className="mb-4 text-xs leading-relaxed text-cream-mute">
                Own The NFT, Own The Bot. No JPEG, No Desk. One Agent Per Wallet On This Drop.
              </p>

              <section className="mt-1">
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <h2 className="label-micro text-cream-dim">
                    {accountId ? "Your Agent" : "Connect To See Your Agent"}
                  </h2>
                </div>

                {loading ? (
                  <div className="panel rounded-md border-dashed p-6 text-center text-sm text-cream-mute">
                    {loadingLine}
                  </div>
                ) : !accountId ? (
                  <div className="rounded-md border border-dashed border-brown-400/25 bg-ink-900/40 p-6 text-center text-sm text-cream-mute">
                    Wallet First — Meteor Or MyNearWallet On Testnet.{" "}
                    <button className="text-brown-300 underline" onClick={() => setView("mint")}>
                      Browse The Drop
                    </button>
                  </div>
                ) : mine.length === 0 ? (
                  <div className="rounded-md border border-dashed border-brown-400/25 bg-ink-900/40 p-6 text-center text-sm text-cream-mute">
                    {stats?.sold_out ? (
                      "Sold Out And You Missed The Drop. Catch A Transfer If You Can."
                    ) : (
                      <>
                        {emptyLine}{" "}
                        <button
                          className="text-brown-300 underline"
                          onClick={() => setView("mint")}
                        >
                          Pick An Agent
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mine.map((n) => (
                      <AgentCard
                        key={n.token_id}
                        nft={n}
                        selected={n.token_id === selectedId}
                        onSelect={() => {
                          setSelectedId(n.token_id);
                          setView("desk");
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>

              {gallery.length > 0 && (
                <section className="mt-5">
                  <h2 className="label-micro mb-2 px-0.5">
                    Floor Gallery · {gallery.length} Hired
                  </h2>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {gallery.slice(0, 12).map((n) => (
                      <div
                        key={n.token_id}
                        className="panel-tight w-24 shrink-0 rounded-md p-1.5"
                        title={n.title}
                      >
                        <div
                          className="aspect-square overflow-hidden rounded-sm bg-ink-800 [&>svg]:h-full [&>svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: n.portrait_svg || "" }}
                        />
                        <p className="mt-1 truncate font-mono text-[9px] text-cream-mute">
                          {n.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </aside>

          {/* main desk */}
          <section className="terminal-scroll lg:col-span-8 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto">
            <div className="p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label-micro">Agent Terminal</p>
                  <p className="text-sm text-cream-mute">
                    NFT-Gated · No JPEG, No Desk · Dry-Run By Default
                  </p>
                </div>
                <SupplyCounter stats={stats} />
              </div>

              <AgentDesk
                nft={selected}
                caller={accountId || ""}
                busy={busy}
                onUpdated={onUpdated}
                onToast={pushToast}
                onError={onError}
              />
            </div>
          </section>
        </main>
      )}

      <footer className="border-t border-brown-400/10 px-4 py-4 text-center font-mono text-[10px] tracking-micro text-cream-mute/60">
        Built For NEAR Hackathon · NFTs That Do Something · Hyperliquid Testnet · Max 100 · One Mint /
        Wallet
      </footer>

      <ToastStack items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
