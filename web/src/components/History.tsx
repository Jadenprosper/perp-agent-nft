"use client";

import { motion } from "framer-motion";
import type { AgentEvent } from "@/lib/api";

export function History({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-md border border-dashed border-brown-400/20 bg-ink-900/40 p-5 text-center text-sm text-cream-mute">
        history is empty. this agent has main-character energy but zero lore… yet.
      </div>
    );
  }
  const items = [...events].reverse();
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => (
        <motion.li
          key={`${e.at}-${i}`}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="rounded-md border border-brown-400/12 bg-ink-900/70 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="chip">{e.kind}</span>
            <time className="font-mono text-[10px] text-cream-mute/55">
              {new Date(e.at).toLocaleString()}
            </time>
          </div>
          <p className="mt-1.5 break-words text-sm text-cream-dim">{e.detail}</p>
          <p className="mt-1 font-mono text-[10px] text-cream-mute/45">by {e.by}</p>
        </motion.li>
      ))}
    </ul>
  );
}
