"use client";

import { motion } from "framer-motion";
import type { AgentEvent } from "@/lib/api";

export function History({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/45">
        history is empty. this agent has main-character energy but zero lore… yet.
      </div>
    );
  }
  const items = [...events].reverse();
  return (
    <ul className="space-y-2">
      {items.map((e, i) => (
        <motion.li
          key={`${e.at}-${i}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="rounded-2xl border border-white/8 bg-ink-800/50 px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="chip border-neon-mint/20 text-neon-mint">{e.kind}</span>
            <time className="font-mono text-[10px] text-white/35">
              {new Date(e.at).toLocaleString()}
            </time>
          </div>
          <p className="mt-1.5 break-words text-sm text-white/75">{e.detail}</p>
          <p className="mt-1 font-mono text-[10px] text-white/35">by {e.by}</p>
        </motion.li>
      ))}
    </ul>
  );
}
