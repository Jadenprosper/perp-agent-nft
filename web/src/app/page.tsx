"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, FlaskConical, Github, LayoutGrid, Terminal } from "lucide-react";
import { AgentCard } from "@/components/AgentCard";
import { AgentDesk } from "@/components/AgentDesk";
import { MintPanel } from "@/components/MintPanel";
import { SupplyCounter } from "@/components/SupplyCounter";
import { ToastStack, type ToastItem } from "@/components/Toast";
import { WalletButton } from "@/components/WalletButton";
import { api, type MintStats, type Nft } from "@/lib/api";
import { EMPTY_LINES, ERR_PREFIX, LOADING_LINES, pick } from "@/lib/copy";
import { getModal } from "@/lib/near";

const TICKER = [
  "100 agent desks · one per wallet",
  "plain english → TP / SL",
  "transfer the NFT · transfer the bot",
  "Hyperliquid testnet only",
  "NEAR HACKATHON · NFTs That Do Something",
  "no mainnet keys were harmed",
  "sold out? bribe a friend",
  "the JPEG finally got a job",
];

export default function HomePage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mine, setMine] = useState<Nft[]>([]);
  const [gallery, setGallery] = useState<Nft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<MintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("dry_run");
  const [vibe, setVibe] = useState("booting…");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [emptyLine] = useState(() => pick(EMPTY_LINES));
  const [loadingLine] = useState(() => pick(LOADING_LINES));
  const [view, setView] = useState<"desk" | "mint">("desk");

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
    try {
      const [all, health] = await Promise.all([api.list(), api.health()]);
      setGallery(all.nfts);
      setStats(all.mint || health.mint);
      setMode(health.mode);
      setVibe(health.vibe);
      const owned = accountId
        ? all.nfts.filter((n) => n.owner_id === accountId)
        : [];
      setMine(owned);
      setSelectedId((cur) => {
        if (cur && owned.some((n) => n.token_id === cur)) return cur;
        if (owned[0]) return owned[0].token_id;
        return null;
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "backend ghosted us");
    } finally {
      setLoading(false);
    }
  }, [accountId, onError]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const t = setInterval(() => {
      void api.mintStats().then(setStats).catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = useMemo(
    () => mine.find((n) => n.token_id === selectedId) || null,
    [mine, selectedId]
  );

  async function onMint(payload: { rules: string; max_size: string }) {
    if (!accountId) return;
    setBusy(true);
    try {
      const res = await api.mint({
        owner_id: accountId,
        rules: payload.rules,
        max_size: payload.max_size,
      });
      pushToast(res.toast);
      setStats(res.mint);
      await refresh();
      setSelectedId(res.nft.token_id);
      setView("desk");
    } catch (e) {
      onError(e instanceof Error ? e.message : "mint failed");
      void api.mintStats().then(setStats).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

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
      {/* ticker — papertrade energy */}
      <div className="overflow-hidden border-b border-brown-400/15 bg-ink-900/95">
        <div className="ticker-track flex whitespace-nowrap py-1.5 font-mono text-[10px] uppercase tracking-micro text-brown-300/80">
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
              perp agent
            </span>
            <span className="cursor-blink font-mono text-brown-400">_</span>
          </a>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {(
              [
                ["desk", "Desk", Terminal],
                ["mint", "Mint", LayoutGrid],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
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
              live · testnet
            </span>
            <span className="chip hidden lg:inline-flex">
              <FlaskConical size={10} /> {mode}
            </span>
            <a
              className="btn-bracket hidden px-2 py-1.5 sm:inline-flex"
              href="https://github.com/Jadenprosper/perp-agent-nft"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={12} /> repo
            </a>
            <WalletButton accountId={accountId} onChange={setAccountId} />
          </div>
        </div>

        {/* mobile view switch */}
        <div className="flex gap-1 border-t border-brown-400/10 px-3 py-1.5 md:hidden">
          {(
            [
              ["desk", "desk"],
              ["mint", "mint"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex-1 rounded-md py-1.5 font-mono text-[11px] uppercase tracking-micro ${
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
            first drop ·{" "}
            <span className="text-brown-300">{stats?.remaining ?? "—"}</span> seats left · one agent /
            wallet
          </p>
          <p className="ml-auto truncate font-mono text-[10px] text-cream-mute/70">{vibe}</p>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-12">
        {/* left rail */}
        <aside
          className={`terminal-scroll border-brown-400/10 lg:col-span-4 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:border-r ${
            view === "mint" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="space-y-0 p-3 sm:p-4">
            <div className="mb-3 flex items-end justify-between px-0.5">
              <div>
                <p className="label-micro">hire desk</p>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream">
                  the NFT got a job
                </h1>
              </div>
              <button
                className="chip hover:bg-brown-500/20"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                <Activity size={11} /> refresh
              </button>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-cream-mute">
              mint one of <span className="text-brown-300">100</span> unique agents. write trades in
              plain english. place Hyperliquid testnet TP/SL. transfer the NFT — the desk clocks in
              for the new owner.
            </p>

            <MintPanel
              owner={accountId}
              busy={busy}
              stats={stats}
              alreadyMinted={mine.length > 0}
              onMint={onMint}
              onConnect={onConnect}
            />

            <section className="mt-4">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <h2 className="label-micro text-cream-dim">
                  {accountId ? "your agent" : "connect to see your agent"}
                </h2>
              </div>

              {loading ? (
                <div className="panel rounded-md border-dashed p-6 text-center text-sm text-cream-mute">
                  {loadingLine}
                </div>
              ) : !accountId ? (
                <div className="rounded-md border border-dashed border-brown-400/25 bg-ink-900/40 p-6 text-center text-sm text-cream-mute">
                  wallet first — Meteor or MyNearWallet on testnet.
                </div>
              ) : mine.length === 0 ? (
                <div className="rounded-md border border-dashed border-brown-400/25 bg-ink-900/40 p-6 text-center text-sm text-cream-mute">
                  {stats?.sold_out
                    ? "sold out and you missed the drop. catch a transfer if you can."
                    : emptyLine}
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
                  floor gallery · {gallery.length} hired
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
                      <p className="mt-1 truncate font-mono text-[9px] text-cream-mute">{n.title}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>

        {/* main desk */}
        <section
          className={`terminal-scroll lg:col-span-8 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto ${
            view === "desk" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="label-micro">agent terminal</p>
                <p className="text-sm text-cream-mute">
                  NFT-gated · no jpeg, no desk · dry-run by default
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

      <footer className="border-t border-brown-400/10 px-4 py-4 text-center font-mono text-[10px] uppercase tracking-micro text-cream-mute/60">
        built for near hackathon · nfts that do something · hyperliquid testnet · max 100 · one mint /
        wallet
      </footer>

      <ToastStack items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
