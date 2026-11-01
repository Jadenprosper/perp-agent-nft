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
        className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-neon-violet/10 via-transparent to-neon-mint/5" />
        <div className="relative flex flex-col items-center gap-4 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/50">
            <Lock size={26} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">desk locked</h2>
            <p className="mt-2 max-w-sm text-sm text-white/55">
              connect Meteor or MyNearWallet (testnet) to mint your one-and-only agent NFT and unlock
              the trading desk.
            </p>
          </div>
          <button className="btn-primary" onClick={onConnect}>
            connect wallet to mint
          </button>
        </div>
      </motion.section>
    );
  }

  if (soldOut && !alreadyMinted) {
    return (
      <motion.section
        layout
        className="glass relative overflow-hidden rounded-3xl border-neon-pink/30 p-5 sm:p-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-neon-pink/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-3 py-4 text-center">
          <Skull className="text-neon-pink" size={36} />
          <h2 className="text-xl font-bold tracking-tight text-neon-pink">SOLD OUT · 100/100</h2>
          <p className="max-w-sm text-sm text-white/60">
            every robot already clocked in. the mint button took a sabbatical. hunt a transfer, bribe
            a friend, or wait for the sequel drop.
          </p>
          <p className="font-mono text-xs text-white/35">
            connected as {owner} · zero seats left · first drop closed
          </p>
        </div>
      </motion.section>
    );
  }

  if (alreadyMinted) {
    return (
      <motion.section
        layout
        className="glass rounded-3xl p-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon-mint/15 text-neon-mint">
            <Wand2 size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold">you already hired yours</h2>
            <p className="mt-1 text-xs text-white/55">
              one agent per wallet on this drop. run the desk below, or transfer the NFT if you want
              to hand the keys to someone else.
            </p>
            <p className="mt-2 font-mono text-[11px] text-white/35">{owner}</p>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      layout
      className="glass rounded-3xl p-4 sm:p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neon-mint/15 text-neon-mint">
          <Wand2 size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold">mint your agent NFT</h2>
          <p className="text-xs text-white/50">
            unique robot traits + funny name · one per wallet · in-app only
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/60">starter rules (plain english)</span>
          <textarea
            className="input min-h-[88px] resize-y"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="long ETH at 3200, TP 3500, SL 3100"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/60">max size (safety leash)</span>
          <input
            className="input font-mono"
            value={maxSize}
            onChange={(e) => setMaxSize(e.target.value)}
          />
        </label>
        <button
          className="btn-primary w-full"
          disabled={busy || soldOut}
          onClick={() => onMint({ rules, max_size: maxSize })}
        >
          <Plus size={16} />
          {busy ? "summoning…" : `mint agent · ${(stats?.minted ?? 0) + 1}/100 seat`}
        </button>
        <p className="text-center text-[11px] text-white/40">
          minting as <span className="font-mono text-neon-mint/80">{owner}</span> · traits are
          random · testnet vibes only
        </p>
      </div>
    </motion.section>
  );
}
