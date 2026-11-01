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
            initial={{ y: 20, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-md border px-3.5 py-2.5 shadow-panel backdrop-blur-xl ${
              t.kind === "err"
                ? "border-rust/40 bg-ink-900/95 text-rust-soft"
                : t.kind === "info"
                  ? "border-brown-400/30 bg-ink-900/95 text-cream"
                  : "border-brown-400/40 bg-ink-900/95 text-brown-200"
            }`}
          >
            <p className="flex-1 text-sm font-medium text-cream">{t.text}</p>
            <button
              aria-label="Dismiss"
              className="rounded p-1 text-cream-mute hover:bg-ink-700 hover:text-cream"
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
