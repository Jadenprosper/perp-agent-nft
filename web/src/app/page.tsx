"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, FlaskConical, Github, Sparkles } from "lucide-react";
import { AgentCard } from "@/components/AgentCard";
import { AgentDesk } from "@/components/AgentDesk";
import { MintPanel } from "@/components/MintPanel";
import { SupplyCounter } from "@/components/SupplyCounter";
import { ToastStack, type ToastItem } from "@/components/Toast";
import { WalletButton } from "@/components/WalletButton";
import { api, type MintStats, type Nft } from "@/lib/api";
import { EMPTY_LINES, ERR_PREFIX, LOADING_LINES, pick } from "@/lib/copy";
import { getModal } from "@/lib/near";

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

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="chip mb-3 border-neon-violet/30 text-neon-violet"
          >
            <Sparkles size={12} /> NEAR HACKATHON · NFTs That Do Something
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-3xl font-bold tracking-tight sm:text-5xl"
          >
            the NFT{" "}
            <span className="bg-gradient-to-r from-neon-mint via-neon-lime to-neon-amber bg-clip-text text-transparent">
              got a job
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base"
          >
            first drop: <span className="text-neon-mint">100</span> unique robot agents. one per
            wallet. mint in-app, write trades in plain english, place Hyperliquid{" "}
            <span className="text-neon-mint">testnet</span> TP/SL. transfer the NFT — the desk
            clocks in for the new owner.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass flex w-full flex-col gap-3 rounded-3xl p-4 sm:w-80"
        >
          <WalletButton accountId={accountId} onChange={setAccountId} />
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="chip">
              <FlaskConical size={11} /> {mode}
            </span>
            <span className="truncate text-white/40">{vibe}</span>
          </div>
          <a
            className="btn-ghost text-xs"
            href="https://github.com/Jadenprosper/perp-agent-nft"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={14} /> repo
          </a>
        </motion.div>
      </header>

      <div className="mb-5">
        <SupplyCounter stats={stats} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          <MintPanel
            owner={accountId}
            busy={busy}
            stats={stats}
            alreadyMinted={mine.length > 0}
            onMint={onMint}
            onConnect={onConnect}
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-white/80">
                {accountId ? "your agent" : "connect to see your agent"}
              </h2>
              <button
                className="chip hover:bg-white/10"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                <Activity size={11} /> refresh
              </button>
            </div>

            {loading ? (
              <div className="glass rounded-3xl p-8 text-center text-sm text-white/50">
                {loadingLine}
              </div>
            ) : !accountId ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/50">
                wallet first — Meteor or MyNearWallet on testnet.
              </div>
            ) : mine.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/50">
                {stats?.sold_out
                  ? "sold out and you missed the drop. catch a transfer if you can."
                  : emptyLine}
              </div>
            ) : (
              <div className="space-y-2.5">
                {mine.map((n) => (
                  <AgentCard
                    key={n.token_id}
                    nft={n}
                    selected={n.token_id === selectedId}
                    onSelect={() => setSelectedId(n.token_id)}
                  />
                ))}
              </div>
            )}
          </section>

          {gallery.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-semibold text-white/50">
                floor gallery · {gallery.length} hired
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.slice(0, 12).map((n) => (
                  <div
                    key={n.token_id}
                    className="w-28 shrink-0 rounded-2xl border border-white/10 bg-ink-900/50 p-2"
                    title={n.title}
                  >
                    <div
                      className="aspect-square overflow-hidden rounded-xl [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: n.portrait_svg || "" }}
                    />
                    <p className="mt-1 truncate text-[10px] text-white/60">{n.title}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-7">
          <AgentDesk
            nft={selected}
            caller={accountId || ""}
            busy={busy}
            onUpdated={onUpdated}
            onToast={pushToast}
            onError={onError}
          />
        </div>
      </div>

      <footer className="mt-12 border-t border-white/5 pt-6 text-center text-[11px] text-white/35">
        built for NEAR HACKATHON · track: NFTs That Do Something · Hyperliquid testnet only · max
        supply 100 · one mint / wallet · no mainnet keys were harmed in this demo
      </footer>

      <ToastStack items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </main>
  );
}
