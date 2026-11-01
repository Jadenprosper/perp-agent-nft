"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Plus, Skull, Wand2 } from "lucide-react";
import type { MintStats } from "@/lib/api";

export function MintPanel({
  owner,
  busy,
  stats,
  alreadyMinted,
  onMint,
  onConnect,
}: {
  owner: string | null;
  busy?: boolean;
  stats: MintStats | null;
  alreadyMinted?: boolean;
  onMint: (payload: { rules: string; max_size: string }) => Promise<void>;
  onConnect: () => void;
}) {
  const [rules, setRules] = useState("long ETH at 3200, TP 3500, SL 3100");
  const [maxSize, setMaxSize] = useState("0.01");
  const soldOut = !!stats?.sold_out;

  if (!owner) {
    return (
      <motion.section
        layout
        className="panel relative overflow-hidden rounded-md p-4 sm:p-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brown-600/10 via-transparent to-brown-800/10" />
        <div className="relative flex flex-col items-center gap-3.5 py-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-brown-400/25 bg-ink-800 text-brown-400">
            <Lock size={22} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">desk locked</h2>
            <p className="mt-2 max-w-sm text-sm text-cream-mute">
              connect Meteor or MyNearWallet (testnet) to mint your one-and-only agent NFT and unlock
              the trading desk.
            </p>
          </div>
          <button className="btn-primary" onClick={onConnect}>
            [ connect wallet ]
          </button>
        </div>
      </motion.section>
    );
  }

  if (soldOut && !alreadyMinted) {
    return (
      <motion.section
        layout
        className="panel relative overflow-hidden rounded-md border-rust/40 p-4 sm:p-5 sold-shake"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-rust/15 blur-3xl" />
        <div className="relative flex flex-col items-center gap-3 py-3 text-center">
          <Skull className="text-rust" size={32} />
          <h2 className="font-display text-xl font-bold tracking-tight text-rust">
            SOLD OUT · 100/100
          </h2>
          <p className="max-w-sm text-sm text-cream-mute">
            every robot already clocked in. the mint button took a sabbatical. hunt a transfer, bribe
            a friend, or wait for the sequel drop.
          </p>
          <p className="font-mono text-[11px] text-cream-mute/60">
            connected as {owner} · zero seats left
          </p>
        </div>
      </motion.section>
    );
  }

  if (alreadyMinted) {
    return (
      <motion.section
        layout
        className="panel rounded-md p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brown-500/15 text-brown-300">
            <Wand2 size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-cream">you already hired yours</h2>
            <p className="mt-1 text-xs text-cream-mute">
              one agent per wallet on this drop. run the desk, or transfer the NFT if you want to
              hand the keys off.
            </p>
            <p className="mt-2 font-mono text-[11px] text-cream-mute/55">{owner}</p>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      layout
      className="panel rounded-md p-3.5 sm:p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brown-500/15 text-brown-300">
          <Wand2 size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">mint your agent NFT</h2>
          <p className="text-[11px] text-cream-mute">
            unique traits · one / wallet · in-app only
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="label-micro">starter rules (plain english)</span>
          <textarea
            className="input min-h-[84px] resize-y"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="long ETH at 3200, TP 3500, SL 3100"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label-micro">max size (safety leash)</span>
          <input
            className="input"
            value={maxSize}
            onChange={(e) => setMaxSize(e.target.value)}
          />
        </label>
        <button
          className="btn-primary w-full"
          disabled={busy || soldOut}
          onClick={() => onMint({ rules, max_size: maxSize })}
        >
          <Plus size={15} />
          {busy ? "summoning…" : `[ mint · ${(stats?.minted ?? 0) + 1}/100 ]`}
        </button>
        <p className="text-center font-mono text-[10px] text-cream-mute/55">
          minting as <span className="text-brown-300">{owner}</span> · testnet vibes
        </p>
      </div>
    </motion.section>
  );
}
