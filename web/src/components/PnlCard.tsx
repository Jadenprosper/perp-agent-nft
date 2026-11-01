"use client";

import { forwardRef } from "react";
import type { PnlSnapshot, PnlTier } from "@/lib/pnl";
import { TIER_SCENES, formatPct, formatUsd, pickOneLiner } from "@/lib/pnl";

export const PnlCard = forwardRef<
  HTMLDivElement,
  {
    snapshot: PnlSnapshot;
    tier: PnlTier;
    oneLiner?: string;
    className?: string;
  }
>(function PnlCard({ snapshot, tier, oneLiner, className = "" }, ref) {
  const scene = TIER_SCENES[tier];
  const line = oneLiner || pickOneLiner(tier, Number(snapshot.tokenId) || 0);
  const positive = snapshot.pnlPct >= 0;
  const pnlColor =
    tier === "liquidated"
      ? "text-[#ff6b9a]"
      : tier === "small_loss"
        ? "text-[#ffc14d]"
        : "text-[#7dffb2]";

  return (
    <div
      ref={ref}
      className={`relative aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-md border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.55)] ${className}`}
      style={{ backgroundColor: "#0a0908" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={scene.src}
        alt=""
        crossOrigin="anonymous"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* scrims for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-transparent to-black/30" />

      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className="text-[10px] font-bold tracking-[0.22em]"
              style={{ color: scene.accent }}
            >
              {scene.label}
            </p>
            <h3 className="mt-1 max-w-[220px] text-lg font-bold leading-tight text-white drop-shadow sm:text-xl">
              {snapshot.agentName}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-white/70">#{snapshot.tokenId}</p>
          </div>
          <div
            className="rounded-md border px-2.5 py-1.5 text-right backdrop-blur-md"
            style={{
              borderColor: `${scene.accent}55`,
              background: "rgba(0,0,0,0.45)",
            }}
          >
            <p className="text-[9px] tracking-wider text-white/55">Side</p>
            <p className="text-sm font-bold text-white">{snapshot.side.replace(/\b\w/g, (c) => c.toUpperCase())}</p>
            <p className="font-mono text-[11px] text-white/75">{snapshot.leverage}x</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-md border border-white/10 bg-black/45 p-3 backdrop-blur-md">
            <Stat label="Market" value={snapshot.market} />
            <Stat label="Entry" value={fmtPx(snapshot.entry)} />
            <Stat
              label={snapshot.liquidated ? "Liqd" : "Exit"}
              value={fmtPx(snapshot.exit)}
            />
          </div>

          <div className="rounded-md border border-white/10 bg-black/50 p-3 backdrop-blur-md">
            <p className={`font-mono text-3xl font-bold tracking-tight sm:text-4xl ${pnlColor}`}>
              {formatPct(snapshot.pnlPct)}
            </p>
            <p className={`mt-1 font-mono text-base ${pnlColor}`}>{formatUsd(snapshot.pnlUsd)}</p>
            <p className="mt-2 text-sm italic leading-snug text-white/85">&ldquo;{line}&rdquo;</p>
          </div>

          <div className="flex items-end justify-between gap-2 px-0.5">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-white/55">
                Perp Agent NFT
              </p>
              <p className="text-[10px] text-white/40">NEAR Hackathon · Testnet Vibes</p>
            </div>
            <p className="font-mono text-[9px] text-white/35">github.com/Jadenprosper/perp-agent-nft</p>
          </div>
        </div>
      </div>
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] tracking-wider text-white/45">{label}</p>
      <p className="truncate font-mono text-xs font-semibold text-white sm:text-sm">{value}</p>
    </div>
  );
}

function fmtPx(n: number): string {
  if (!n) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}
