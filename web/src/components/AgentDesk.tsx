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
      <div className="panel relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-md p-8 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(166,124,82,0.12),transparent_55%)]" />
        <div className="floaty relative mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-brown-400/25 bg-ink-800 text-brown-400/80">
          <Bot size={28} />
        </div>
        <h3 className="relative font-display text-lg font-semibold">
          {caller ? "No Agent On This Wallet" : "Connect To Unlock The Desk"}
        </h3>
        <p className="relative mt-2 max-w-sm text-sm text-cream-mute">
          {caller
            ? "Mint Your One-Per-Wallet Agent To Open The Trading Desk. No NFT = Locked Out (On Purpose)."
            : "Wallet Selector First (Meteor / MyNearWallet). Then Mint. Then Degen — Testnet Only."}
        </p>
        <p className="relative mt-4 chip">Token-Gated · 1 NFT / Wallet · Max 100</p>
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
      if (res.parse_error) onToast(`Saved, But Parser Side-Eyed It: ${res.parse_error}`, "info");
      else onToast("Rules Etched Into The NFT. Agent Is Locked In.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save Failed");
    } finally {
      setWorking(false);
    }
  }

  async function preview() {
    try {
      const res = await api.parse(rules);
      setParsed(res.order);
      setParseErr(null);
      onToast("Parser Understood That. Scary How Literate This Thing Is.", "info");
    } catch (e) {
      setParsed(null);
      setParseErr(e instanceof Error ? e.message : "Parse Failed");
    }
  }

  async function fire(dryRun: boolean) {
    setWorking(true);
    try {
      const res = await api.execute(nft!.token_id, { caller, dry_run: dryRun });
      onUpdated(res.nft);
      onToast(res.toast || (dryRun ? "Dry Run Stamped" : "Order Sent To Testnet"));
      setTab("share");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Execute Failed");
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
      onError(e instanceof Error ? e.message : "Transfer Failed");
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working || !isOwner;

  return (
    <motion.section
      key={nft.token_id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel rounded-md"
    >
      {/* header strip */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brown-400/10 p-3.5 sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <AgentPortrait nft={nft} size={64} className="hidden sm:block" />
          <div className="min-w-0">
            <div className="chip mb-1.5">Agent #{nft.token_id}</div>
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {nft.title}
            </h2>
            <p className="mt-1 text-sm text-cream-mute">
              {STATUS_FLAVOR[nft.config.status] || "Mysterious Aura"}
            </p>
            {nft.config.traits && (
              <p className="mt-1 truncate font-mono text-[10px] text-cream-mute/60">
                {(nft.config.traits as Record<string, string>).helm} ·{" "}
                {(nft.config.traits as Record<string, string>).gear} · Mood{" "}
                {(nft.config.traits as Record<string, string>).mood}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-brown-400/15 bg-ink-900 px-3 py-2 text-right">
          <p className="label-micro">Owner</p>
          <p className="mt-0.5 font-mono text-xs text-brown-300">{nft.owner_id}</p>
        </div>
      </div>

      {!isOwner && (
        <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-md border border-rust/35 bg-rust/10 px-3 py-2.5 text-sm text-rust-soft sm:mx-4">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          You Don&apos;t Hold This NFT. Look, Don&apos;t Touch — Transfer It To Yourself First.
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-brown-400/10 px-3 pt-3 sm:px-4">
        {(
          [
            ["trade", "Trade"],
            ["share", "PnL Card"],
            ["transfer", "Transfer"],
            ["lore", "Lore"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap border-b-2 px-3 pb-2.5 font-mono text-[11px] tracking-micro transition ${
              tab === id
                ? "border-brown-400 text-brown-200"
                : "border-transparent text-cream-mute hover:text-cream-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-3.5 sm:p-4">
        <AnimatePresence mode="wait">
          {tab === "trade" && (
            <motion.div
              key="trade"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              <div className="grid gap-3 lg:grid-cols-5">
                <div className="space-y-3 lg:col-span-3">
                  <label className="block space-y-1.5">
                    <span className="label-micro">Plain-Language Rules</span>
                    <textarea
                      className="input min-h-[110px]"
                      disabled={disabled}
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block space-y-1.5">
                      <span className="label-micro">Max Size</span>
                      <input
                        className="input"
                        disabled={disabled}
                        value={maxSize}
                        onChange={(e) => setMaxSize(e.target.value)}
                      />
                    </label>
                    <div className="rounded-md border border-brown-400/15 bg-ink-900 px-3 py-2">
                      <p className="label-micro">Status</p>
                      <p className="mt-1 text-sm font-semibold text-brown-300">
                        {String(nft.config.status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:col-span-2">
                  <p className="label-micro">Ticket</p>
                  <button className="btn-ghost w-full justify-start" disabled={disabled} onClick={saveRules}>
                    <RefreshCw size={13} /> Save To NFT
                  </button>
                  <button className="btn-ghost w-full justify-start" disabled={!rules.trim()} onClick={preview}>
                    <Crosshair size={13} /> Preview Parse
                  </button>
                  <button
                    className="btn-primary w-full"
                    disabled={disabled}
                    onClick={() => fire(true)}
                  >
                    <Play size={13} /> Dry-Run Ticket
                  </button>
                  <button
                    className="btn-bracket w-full"
                    disabled={disabled}
                    onClick={() => fire(false)}
                    title="Needs HL_PRIVATE_KEY + DRY_RUN=False On The Server"
                  >
                    <Play size={13} /> Fire Testnet
                  </button>
                  <p className="text-[10px] leading-relaxed text-cream-mute/60">
                    Default Is Dry-Run. Live Hyperliquid Testnet Only When The Backend Has A Testnet
                    Key. Mainnet Is Banned In Code.
                  </p>
                </div>
              </div>

              {(parsed || parseErr) && (
                <div
                  className={`rounded-md border p-3 font-mono text-xs ${
                    parseErr
                      ? "border-rust/35 bg-rust/10 text-rust-soft"
                      : "border-brown-400/30 bg-brown-500/10 text-brown-200"
                  }`}
                >
                  <pre className="whitespace-pre-wrap break-all">
                    {parseErr || JSON.stringify(parsed, null, 2)}
                  </pre>
                </div>
              )}
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
              className="space-y-3"
            >
              <p className="text-sm text-cream-mute">
                Sell The NFT, Sell The Agent. Rules, History, And Desk Rights Move Together. Old Owner
                Gets The Boot — No Take-Backsies.
              </p>
              <input
                className="input"
                placeholder="receiver.near / bob.testnet"
                disabled={disabled}
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
              />
              <button className="btn-primary w-full" disabled={disabled || !receiver} onClick={transfer}>
                <ArrowRightLeft size={14} /> [ Transfer Agent NFT ]
              </button>
            </motion.div>
          )}

          {tab === "lore" && (
            <motion.div
              key="lore"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <AgentPortrait nft={nft} size={132} className="mx-auto sm:mx-0" />
                <div className="flex-1 space-y-2 rounded-md border border-brown-400/15 bg-ink-900 p-3 text-sm">
                  <p className="label-micro">Robot Sheet</p>
                  {nft.config.traits ? (
                    <ul className="space-y-1 text-cream-dim">
                      <li>
                        <span className="text-cream-mute">Catchphrase · </span>
                        &ldquo;{(nft.config.traits as Record<string, string>).catchphrase}&rdquo;
                      </li>
                      <li>
                        <span className="text-cream-mute">Helm · </span>
                        {(nft.config.traits as Record<string, string>).helm}
                      </li>
                      <li>
                        <span className="text-cream-mute">Body · </span>
                        {(nft.config.traits as Record<string, string>).body}
                      </li>
                      <li>
                        <span className="text-cream-mute">Gear · </span>
                        {(nft.config.traits as Record<string, string>).gear}
                      </li>
                      <li>
                        <span className="text-cream-mute">Aura · </span>
                        {(nft.config.traits as Record<string, string>).aura}
                      </li>
                      <li>
                        <span className="text-cream-mute">Mood · </span>
                        {(nft.config.traits as Record<string, string>).mood} (
                        {(nft.config.traits as Record<string, number>).performance_bps} Bps Vibes)
                      </li>
                    </ul>
                  ) : (
                    <p className="text-cream-mute">Classic Blank Agent — Traits Arrive On Fresh Mints.</p>
                  )}
                  <p className="text-xs text-cream-mute/70">{nft.description}</p>
                </div>
              </div>
              {nft.config.last_action && (
                <div className="rounded-md border border-brown-400/25 bg-brown-500/10 p-3 text-sm">
                  <p className="label-micro text-brown-300">Last Action</p>
                  <p className="mt-1 font-mono text-xs text-cream-dim">{nft.config.last_action}</p>
                </div>
              )}
              <History events={nft.history} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
