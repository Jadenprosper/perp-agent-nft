"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  Bot,
  Crosshair,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { Nft } from "@/lib/api";
import { api } from "@/lib/api";
import { STATUS_FLAVOR } from "@/lib/copy";
import { History } from "./History";
import { AgentPortrait } from "./AgentPortrait";
import { PnlSharePanel } from "./PnlSharePanel";

export function AgentDesk({
  nft,
  caller,
  busy,
  onUpdated,
  onToast,
  onError,
}: {
  nft: Nft | null;
  caller: string;
  busy: boolean;
  onUpdated: (n: Nft) => void;
  onToast: (msg: string, kind?: "ok" | "err" | "info") => void;
  onError: (msg: string) => void;
}) {
  const [rules, setRules] = useState("");
  const [maxSize, setMaxSize] = useState("0.01");
  const [receiver, setReceiver] = useState("");
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"trade" | "share" | "transfer" | "lore">("trade");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!nft) return;
    setRules(nft.config.rules || "");
    setMaxSize(nft.config.max_size || "0.01");
    setParsed(null);
    setParseErr(null);
  }, [nft?.token_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nft) {
    return (
      <div className="glass relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-3xl p-8 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,255,0.12),transparent_55%)]" />
        <div className="floaty relative mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-white/40">
          <Bot size={32} />
        </div>
        <h3 className="relative text-lg font-semibold">
          {caller ? "no agent on this wallet" : "connect to unlock the desk"}
        </h3>
        <p className="relative mt-2 max-w-sm text-sm text-white/50">
          {caller
            ? "mint your one-per-wallet agent to open the trading desk. no NFT = locked out (on purpose)."
            : "Wallet Selector first (Meteor / MyNearWallet). then mint. then degen — testnet only."}
        </p>
        <p className="relative mt-4 chip border-neon-violet/30 text-neon-violet">token-gated · 1 NFT / wallet · max 100</p>
      </div>
    );
  }

  const isOwner = nft.owner_id === caller;

  async function saveRules() {
    setWorking(true);
    try {
      const res = await api.setRules(nft!.token_id, {
        caller,
        rules,
        max_size: maxSize,
        status: rules.trim() ? "armed" : "idle",
      });
      onUpdated(res.nft);
      setParsed((res.parsed as Record<string, unknown>) || null);
      setParseErr(res.parse_error);
      if (res.parse_error) onToast(`saved, but parser side-eyed it: ${res.parse_error}`, "info");
      else onToast("rules etched into the NFT. agent is locked in.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "save failed");
    } finally {
      setWorking(false);
    }
  }

  async function preview() {
    try {
      const res = await api.parse(rules);
      setParsed(res.order);
      setParseErr(null);
      onToast("parser understood that. scary how literate this thing is.", "info");
    } catch (e) {
      setParsed(null);
      setParseErr(e instanceof Error ? e.message : "parse failed");
    }
  }

  async function fire(dryRun: boolean) {
    setWorking(true);
    try {
      const res = await api.execute(nft!.token_id, { caller, dry_run: dryRun });
      onUpdated(res.nft);
      onToast(res.toast || (dryRun ? "dry run stamped" : "order sent to testnet"));
      setTab("share");
    } catch (e) {
      onError(e instanceof Error ? e.message : "execute failed");
    } finally {
      setWorking(false);
    }
  }

  async function transfer() {
    if (!receiver.trim()) return;
    setWorking(true);
    try {
      const res = await api.transfer(nft!.token_id, {
        caller,
        receiver_id: receiver.trim(),
      });
      onUpdated(res.nft);
      onToast(res.toast);
      setReceiver("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "transfer failed");
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working || !isOwner;

  return (
    <motion.section
      key={nft.token_id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AgentPortrait nft={nft} size={72} className="hidden sm:block" />
          <div className="min-w-0">
            <div className="chip mb-2 border-neon-mint/25 text-neon-mint">agent #{nft.token_id}</div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{nft.title}</h2>
            <p className="mt-1 text-sm text-white/55">
              {STATUS_FLAVOR[nft.config.status] || "mysterious aura"}
            </p>
            {nft.config.traits && (
              <p className="mt-1 truncate text-xs text-white/40">
                {(nft.config.traits as Record<string, string>).helm} ·{" "}
                {(nft.config.traits as Record<string, string>).gear} · mood{" "}
                {(nft.config.traits as Record<string, string>).mood}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40">owner</p>
          <p className="font-mono text-xs text-neon-mint">{nft.owner_id}</p>
        </div>
      </div>

      {!isOwner && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-neon-pink/30 bg-neon-pink/10 px-3 py-2.5 text-sm text-neon-pink">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          you don&apos;t hold this NFT. look, don&apos;t touch — transfer it to yourself first.
        </div>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["trade", "trade desk"],
            ["share", "PnL card"],
            ["transfer", "yeet ownership"],
            ["lore", "agent lore"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === id
                ? "bg-neon-mint text-ink-950"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "trade" && (
          <motion.div
            key="trade"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 space-y-3"
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-white/60">plain-language rules</span>
              <textarea
                className="input min-h-[100px]"
                disabled={disabled}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-white/60">max size</span>
                <input
                  className="input font-mono"
                  disabled={disabled}
                  value={maxSize}
                  onChange={(e) => setMaxSize(e.target.value)}
                />
              </label>
              <div className="rounded-2xl border border-white/10 bg-ink-800/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/40">status</p>
                <p className="mt-1 text-sm font-semibold text-neon-amber">{nft.config.status}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="btn-ghost flex-1" disabled={disabled} onClick={saveRules}>
                <RefreshCw size={14} /> save to NFT
              </button>
              <button className="btn-ghost flex-1" disabled={!rules.trim()} onClick={preview}>
                <Crosshair size={14} /> preview parse
              </button>
            </div>

            {(parsed || parseErr) && (
              <div
                className={`rounded-2xl border p-3 font-mono text-xs ${
                  parseErr
                    ? "border-neon-pink/30 bg-neon-pink/10 text-neon-pink"
                    : "border-neon-mint/30 bg-neon-mint/10 text-neon-mint"
                }`}
              >
                <pre className="whitespace-pre-wrap break-all">
                  {parseErr || JSON.stringify(parsed, null, 2)}
                </pre>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="btn-primary"
                disabled={disabled}
                onClick={() => fire(true)}
              >
                <Play size={14} /> dry-run ticket
              </button>
              <button
                className="btn-ghost border-neon-amber/30 text-neon-amber"
                disabled={disabled}
                onClick={() => fire(false)}
                title="Needs HL_PRIVATE_KEY + DRY_RUN=false on the server"
              >
                <Play size={14} /> fire testnet (if armed)
              </button>
            </div>
            <p className="text-[11px] text-white/40">
              default is dry-run. live Hyperliquid testnet only when the backend has a testnet key.
              mainnet is banned in code — we&apos;re degens, not reckless.
            </p>
          </motion.div>
        )}

        {tab === "share" && (
          <motion.div
            key="share"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <PnlSharePanel nft={nft} onToast={onToast} onError={onError} />
          </motion.div>
        )}

        {tab === "transfer" && (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 space-y-3"
          >
            <p className="text-sm text-white/60">
              sell the NFT, sell the agent. rules, history, and desk rights move together. old owner
              gets the boot — no take-backsies.
            </p>
            <input
              className="input font-mono"
              placeholder="receiver.near / bob.testnet"
              disabled={disabled}
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
            />
            <button className="btn-primary w-full" disabled={disabled || !receiver} onClick={transfer}>
              <ArrowRightLeft size={14} /> transfer agent NFT
            </button>
          </motion.div>
        )}

        {tab === "lore" && (
          <motion.div
            key="lore"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-4 space-y-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <AgentPortrait nft={nft} size={140} className="mx-auto sm:mx-0" />
              <div className="flex-1 space-y-2 rounded-2xl border border-white/10 bg-ink-800/50 p-3 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-white/40">robot sheet</p>
                {nft.config.traits ? (
                  <ul className="space-y-1 text-white/70">
                    <li>
                      <span className="text-white/40">catchphrase · </span>
                      &ldquo;{(nft.config.traits as Record<string, string>).catchphrase}&rdquo;
                    </li>
                    <li>
                      <span className="text-white/40">helm · </span>
                      {(nft.config.traits as Record<string, string>).helm}
                    </li>
                    <li>
                      <span className="text-white/40">body · </span>
                      {(nft.config.traits as Record<string, string>).body}
                    </li>
                    <li>
                      <span className="text-white/40">gear · </span>
                      {(nft.config.traits as Record<string, string>).gear}
                    </li>
                    <li>
                      <span className="text-white/40">aura · </span>
                      {(nft.config.traits as Record<string, string>).aura}
                    </li>
                    <li>
                      <span className="text-white/40">mood · </span>
                      {(nft.config.traits as Record<string, string>).mood} (
                      {(nft.config.traits as Record<string, number>).performance_bps} bps vibes)
                    </li>
                  </ul>
                ) : (
                  <p className="text-white/50">classic blank agent — traits arrive on fresh mints.</p>
                )}
                <p className="text-xs text-white/40">{nft.description}</p>
              </div>
            </div>
            {nft.config.last_action && (
              <div className="rounded-2xl border border-neon-violet/25 bg-neon-violet/10 p-3 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-neon-violet">last action</p>
                <p className="mt-1 font-mono text-xs text-white/80">{nft.config.last_action}</p>
              </div>
            )}
            <History events={nft.history} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
