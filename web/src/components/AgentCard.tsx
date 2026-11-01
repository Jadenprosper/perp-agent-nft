"use client";

import { motion } from "framer-motion";
import { ChevronRight, Sparkles, Zap } from "lucide-react";
import type { Nft } from "@/lib/api";
import { STATUS_FLAVOR } from "@/lib/copy";
import { AgentPortrait } from "./AgentPortrait";

const statusColor: Record<string, string> = {
  idle: "text-cream-mute border-brown-400/20 bg-ink-800",
  armed: "text-brown-300 border-brown-400/40 bg-brown-500/15",
  active: "text-brown-200 border-brown-400/50 bg-brown-500/20",
  paused: "text-cream-dim border-brown-400/25 bg-ink-700",
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
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      onClick={onSelect}
      className={`group w-full rounded-md border p-3 text-left transition ${
        selected
          ? "border-brown-400/55 bg-ink-800 shadow-glow"
          : "border-brown-400/15 bg-ink-900/70 hover:border-brown-400/35 hover:bg-ink-800/80"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`relative shrink-0 ${st === "active" ? "pulse-ring rounded-md" : ""}`}>
          <AgentPortrait nft={nft} size={48} />
          {st === "armed" && (
            <Sparkles size={11} className="absolute -right-1 -top-1 text-brown-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold tracking-tight">{nft.title}</h3>
            <span className={`chip ${statusColor[st] || statusColor.idle}`}>
              <Zap size={9} />
              {st}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-cream-mute">
            {traits.catchphrase
              ? `"${traits.catchphrase}"`
              : nft.config.rules || STATUS_FLAVOR[st] || "untitled degen"}
          </p>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-micro text-cream-mute/55">
            #{nft.token_id} · {nft.owner_id}
          </p>
        </div>
        <ChevronRight
          size={16}
          className="mt-1.5 text-cream-mute/30 transition group-hover:text-brown-300"
        />
      </div>
    </motion.button>
  );
}
