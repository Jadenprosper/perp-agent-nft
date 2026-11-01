"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Flame, PartyPopper } from "lucide-react";
import type { MintStats } from "@/lib/api";
import { pick, SOLD_OUT_LINES } from "@/lib/copy";
import { useMemo } from "react";

export function SupplyCounter({ stats }: { stats: MintStats | null }) {
  const soldLine = useMemo(() => pick(SOLD_OUT_LINES), []);
  if (!stats) {
    return (
      <div className="chip animate-pulse">
        <Flame size={12} /> —/100
      </div>
    );
  }
  const { minted, max_supply, sold_out, remaining } = stats;
  const pct = Math.min(100, Math.round((minted / max_supply) * 100));

  return (
    <div className="glass w-full overflow-hidden rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {sold_out ? (
            <PartyPopper size={16} className="text-neon-pink" />
          ) : (
            <Flame size={16} className="text-neon-amber" />
          )}
          <span className="text-xs font-medium uppercase tracking-wider text-white/55">
            first drop
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={`${minted}-${max_supply}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`font-mono text-lg font-bold tabular-nums sm:text-xl ${
              sold_out ? "text-neon-pink" : "text-neon-mint"
            }`}
          >
            {minted}
            <span className="text-white/35">/{max_supply}</span>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`h-full rounded-full ${
            sold_out
              ? "bg-gradient-to-r from-neon-pink to-neon-violet"
              : "bg-gradient-to-r from-neon-mint via-neon-lime to-neon-amber"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-white/50">
        {sold_out ? (
          <span className="text-neon-pink/90">{soldLine}</span>
        ) : (
          <>
            <span className="text-neon-mint">{remaining}</span> desks left · one agent per wallet ·
            no marketplace flip required — mint in-app
          </>
        )}
      </p>
    </div>
  );
}
