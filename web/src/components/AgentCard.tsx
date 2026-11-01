"use client";

import { motion } from "framer-motion";
import { ChevronRight, Sparkles, Zap } from "lucide-react";
import type { Nft } from "@/lib/api";
import { STATUS_FLAVOR } from "@/lib/copy";
import { AgentPortrait } from "./AgentPortrait";

const statusColor: Record<string, string> = {
  idle: "text-white/50 border-white/15 bg-white/5",
  armed: "text-neon-amber border-neon-amber/30 bg-neon-amber/10",
  active: "text-neon-mint border-neon-mint/30 bg-neon-mint/10",
  paused: "text-neon-violet border-neon-violet/30 bg-neon-violet/10",
};

export function AgentCard({
  nft,
  selected,
  onSelect,
}: {
  nft: Nft;
  selected?: boolean;
  onSelect: () => void;
}) {
  const st = nft.config.status || "idle";
  const traits = (nft.config.traits || {}) as Record<string, string | number>;
  return (
    <motion.button
      layout
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`group w-full rounded-3xl border p-4 text-left transition ${
        selected
          ? "border-neon-mint/50 bg-ink-800/90 shadow-glow"
          : "border-white/10 bg-ink-900/60 hover:border-white/20 hover:bg-ink-800/70"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`relative shrink-0 ${st === "active" ? "pulse-ring rounded-2xl" : ""}`}>
          <AgentPortrait nft={nft} size={56} />
          {st === "armed" && (
            <Sparkles size={12} className="absolute -right-1 -top-1 text-neon-amber" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold tracking-tight">{nft.title}</h3>
            <span className={`chip ${statusColor[st] || statusColor.idle}`}>
              <Zap size={10} />
              {st}
            </span>
            {traits.mood ? (
              <span className="chip border-white/10 text-white/60">{String(traits.mood)}</span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-white/55">
            {traits.catchphrase
              ? `"${traits.catchphrase}"`
              : nft.config.rules || STATUS_FLAVOR[st] || "untitled degen"}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/35">
            #{nft.token_id} · {nft.owner_id}
          </p>
        </div>
        <ChevronRight
          size={18}
          className="mt-2 text-white/25 transition group-hover:text-neon-mint"
        />
      </div>
    </motion.button>
  );
}
