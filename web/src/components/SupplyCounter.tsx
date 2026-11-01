"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Flame, PartyPopper } from "lucide-react";
import type { MintStats } from "@/lib/api";
import { pick, SOLD_OUT_LINES } from "@/lib/copy";
import { useMemo } from "react";

export function SupplyCounter({
  stats,
  compact,
}: {
  stats: MintStats | null;
  compact?: boolean;
}) {
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

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {sold_out ? (
          <PartyPopper size={13} className="text-rust" />
        ) : (
          <Flame size={13} className="text-brown-400" />
        )}
        <AnimatePresence mode="wait">
          <motion.span
            key={`${minted}-${max_supply}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`font-mono text-sm font-semibold tabular-nums ${
              sold_out ? "text-rust" : "text-brown-300"
            }`}
          >
            {minted}
            <span className="text-cream-mute">/{max_supply}</span>
          </motion.span>
        </AnimatePresence>
        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink-700 sm:block">
          <div
            className={`h-full rounded-full ${sold_out ? "bg-rust" : "bg-brown-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="panel w-full overflow-hidden rounded-md p-3 sm:p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {sold_out ? (
            <PartyPopper size={15} className="text-rust" />
          ) : (
            <Flame size={15} className="text-brown-400" />
          )}
          <span className="label-micro">first drop</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={`${minted}-${max_supply}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`font-mono text-lg font-bold tabular-nums sm:text-xl ${
              sold_out ? "text-rust" : "text-brown-300"
            }`}
          >
            {minted}
            <span className="text-cream-mute/50">/{max_supply}</span>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <motion.div
          className={`h-full rounded-full ${
            sold_out
              ? "bg-gradient-to-r from-rust to-brown-600"
              : "bg-gradient-to-r from-brown-700 via-brown-500 to-brown-300"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
        />
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-cream-mute">
        {sold_out ? (
          <span className="text-rust/90">{soldLine}</span>
        ) : (
          <>
            <span className="text-brown-300">{remaining}</span> desks left · one agent per wallet ·
            mint in-app
          </>
        )}
      </p>
    </div>
  );
}
