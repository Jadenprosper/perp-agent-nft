"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export type ToastItem = { id: string; text: string; kind?: "ok" | "err" | "info" };

export function ToastStack({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-glow backdrop-blur-xl ${
              t.kind === "err"
                ? "border-neon-pink/40 bg-ink-900/90 text-neon-pink"
                : t.kind === "info"
                  ? "border-neon-violet/40 bg-ink-900/90 text-white"
                  : "border-neon-mint/40 bg-ink-900/90 text-neon-mint"
            }`}
          >
            <p className="flex-1 text-sm font-medium text-white/95">{t.text}</p>
            <button
              aria-label="dismiss"
              className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
              onClick={() => onDismiss(t.id)}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
