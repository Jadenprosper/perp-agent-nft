"use client";
import { useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";

/** Crowned paper-bag agent running with its green candle sword; run speed tracks real load progress. */
export function LoadingScreen({ dataReady }: { dataReady: boolean }) {
  const [fonts, setFonts] = useState(false);
  const [img, setImg] = useState(false);
  const [win, setWin] = useState(false);
  const [creep, setCreep] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    document.fonts?.ready.then(() => setFonts(true)).catch(() => setFonts(true));
    if (document.readyState === "complete") setWin(true);
    else window.addEventListener("load", () => setWin(true), { once: true });
    const t = setInterval(() => setCreep((c) => Math.min(0.15, c + 0.01)), 300);
    return () => clearInterval(t);
  }, []);

  const steps = [fonts, img, win, dataReady];
  const progress = Math.min(1, steps.filter(Boolean).length / steps.length * 0.85 + creep);
  const done = steps.every(Boolean);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 650);
    return () => clearTimeout(t);
  }, [done]);
  if (gone) return null;

  // Slow (1.4s stride) when little is ready → very fast (0.18s) near done.
  const stride = done ? 0.14 : Math.max(0.18, 1.4 - progress * 1.3);
  const label = done ? "Ready To Trade" : !dataReady ? "Reading The Chain" : !img ? "Waking The Agent" : "Sharpening The Candle";

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950/90 backdrop-blur-sm transition-opacity duration-500 ${done ? "opacity-0" : "opacity-100"}`}
      style={{ ["--run" as string]: `${stride}s` }} role="status" aria-live="polite">
      <div className="relative h-52 w-72 overflow-hidden">
        <div className="run-speedlines absolute inset-0" aria-hidden />
        <div className="run-body absolute bottom-3 left-1/2 -ml-[68px] h-40 w-[136px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBase("/loader-runner.webp")} alt="" onLoad={() => setImg(true)} onError={() => setImg(true)}
            className="h-40 w-[136px] object-contain drop-shadow-[0_0_12px_rgba(34,197,94,0.25)]" />
        </div>
        <div className="run-ground absolute inset-x-0 bottom-4 h-1" aria-hidden />
      </div>
      <p className="mt-4 font-mono text-xs tracking-micro text-brown-300">{label}… {Math.round(progress * 100)}%</p>
      <div className="mt-2 h-1 w-48 overflow-hidden rounded bg-ink-800">
        <div className="h-full bg-brown-400 transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
