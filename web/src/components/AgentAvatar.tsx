"use client";

import { useEffect, useRef, useState } from "react";
import { agentEvents, type AgentEvent } from "@/lib/agentEvents";

type Mood = "idle" | "entry" | "win" | "loss" | "sleep";
const WIN_LINES = ["Bag Secured", "Take Profit, Take A Nap", "The JPEG Pays Rent Now", "Told You So (Paper Edition)"];
const LOSS_LINES = ["This Is Fine", "Stop Loss Did Its Job, Sadly", "I Meant To Do That", "Paper Hands, Paper Bag"];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

export function AgentAvatar({ image, name, running }: { image: string; name: string; running: boolean }) {
  const [mood, setMood] = useState<Mood>(running ? "idle" : "sleep");
  const [bubble, setBubble] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => setMood(running ? "idle" : "sleep"), [running]);

  useEffect(
    () =>
      agentEvents.on((e: AgentEvent) => {
        if (timer.current) clearTimeout(timer.current);
        const settle = (ms: number) => {
          timer.current = setTimeout(() => {
            setMood(runningRef.current ? "idle" : "sleep");
            setBubble(null);
          }, ms);
        };
        if (e.type === "say") { setBubble(e.text); settle(4500); return; }
        if (e.type === "paused") { setMood("sleep"); setBubble(null); return; }
        if (e.type === "running") { setMood("idle"); setBubble("Clocking In"); settle(2000); return; }
        if (e.type === "entry") { setMood("entry"); setBubble(e.reason); settle(4500); return; }
        if (e.type === "win") { setMood("win"); setBurst((b) => b + 1); setBubble(`${pick(WIN_LINES)} · +$${e.pnl.toFixed(2)}`); settle(4000); return; }
        if (e.type === "loss") { setMood("loss"); setBubble(`${pick(LOSS_LINES)} · -$${Math.abs(e.pnl).toFixed(2)}`); settle(4000); }
      }),
    []
  );

  return (
    <div className="relative flex flex-col items-center pt-10">
      {bubble && (
        <div className="agent-bubble absolute left-1/2 top-0 z-10 max-w-[240px] -translate-x-1/2 rounded-md border border-brown-400/40 bg-ink-800 px-2.5 py-1.5 text-center font-mono text-[10px] leading-snug text-brown-100 shadow-panel">
          {bubble}
        </div>
      )}
      <div className={`agent-av agent-${mood} relative h-28 w-28 sm:h-32 sm:w-32`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={name} className="h-full w-full rounded-xl border border-brown-400/30 object-cover" />
        {mood === "sleep" && (
          <span className="agent-zzz pointer-events-none absolute -right-3 -top-2 font-mono text-sm font-bold text-brown-300">Zzz</span>
        )}
        {burst > 0 && mood === "win" && (
          <div key={burst} className="pointer-events-none absolute inset-0">
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className="agent-confetti" style={{ ["--a" as string]: `${(360 / 14) * i}deg`, background: i % 3 ? "#c4a574" : "#4ade80" }} />
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 font-mono text-[10px] tracking-micro text-cream-mute">
        {mood === "sleep" ? "Agent Paused · Napping" : mood === "win" ? "Victory Lap" : mood === "loss" ? "Sulking Quietly" : mood === "entry" ? "Leaning In" : "On Shift · Watching Candles"}
      </p>
    </div>
  );
}
