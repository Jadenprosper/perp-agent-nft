"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toPng } from "html-to-image";
import { Download, RefreshCw, Share2 } from "lucide-react";
import type { Nft } from "@/lib/api";
import {
  type PnlSide,
  type PnlSnapshot,
  type PnlTier,
  TIER_SCENES,
  buildShareText,
  computePnl,
  guessTradeFromRules,
  pickOneLiner,
  tierFromPnl,
  xIntentUrl,
} from "@/lib/pnl";
import { PnlCard } from "./PnlCard";

const TIERS: PnlTier[] = ["moon", "win", "small_loss", "liquidated"];

export function PnlSharePanel({
  nft,
  onToast,
  onError,
}: {
  nft: Nft;
  onToast: (msg: string, kind?: "ok" | "err" | "info") => void;
  onError: (msg: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const guessed = useMemo(() => guessTradeFromRules(nft.config.rules || ""), [nft.config.rules]);

  const [market, setMarket] = useState(guessed.market || "ETH");
  const [side, setSide] = useState<PnlSide>(guessed.side || "long");
  const [leverage, setLeverage] = useState(guessed.leverage || 10);
  const [entry, setEntry] = useState(guessed.entry || 3200);
  const [exit, setExit] = useState(guessed.exit || 3500);
  const [size, setSize] = useState(Number(nft.config.max_size) || 0.01);
  const [liquidated, setLiquidated] = useState(false);
  const [tierOverride, setTierOverride] = useState<PnlTier | "auto">("auto");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const g = guessTradeFromRules(nft.config.rules || "");
    if (g.market) setMarket(g.market);
    if (g.side) setSide(g.side);
    if (g.entry) setEntry(g.entry);
    if (g.exit) setExit(g.exit);
    if (g.leverage) setLeverage(g.leverage);
    setSize(Number(nft.config.max_size) || 0.01);
    setLiquidated(false);
    setTierOverride("auto");
  }, [nft.token_id, nft.config.rules, nft.config.max_size]);

  const { pnlPct, pnlUsd } = useMemo(
    () => computePnl({ side, entry, exit, leverage, size }),
    [side, entry, exit, leverage, size]
  );

  const autoTier = tierFromPnl(liquidated ? -100 : pnlPct, liquidated);
  const tier = tierOverride === "auto" ? autoTier : tierOverride;
  const oneLiner = pickOneLiner(tier, Number(nft.token_id) + Math.round(pnlPct));

  const snapshot: PnlSnapshot = {
    agentName: nft.title,
    tokenId: nft.token_id,
    market,
    side,
    leverage,
    entry,
    exit,
    pnlPct: liquidated ? Math.min(pnlPct, -100) : pnlPct,
    pnlUsd: liquidated ? Math.min(pnlUsd, -Math.abs(pnlUsd) || -entry * size) : pnlUsd,
    liquidated,
    size,
  };

  async function downloadPng() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0a0908",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `perp-agent-${nft.token_id}-${tier}-pnl.png`;
      a.click();
      onToast("PNG Saved — Go Flex Responsibly.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "PNG Export Failed");
    } finally {
      setBusy(false);
    }
  }

  function shareOnX() {
    const text = buildShareText(snapshot, tier, oneLiner);
    window.open(xIntentUrl(text), "_blank", "noopener,noreferrer");
    onToast("Opened X Compose — You Hit Post, We Don't.", "info");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-cream-dim">Shareable PnL Card</h3>
          <span className="chip" style={{ borderColor: `${TIER_SCENES[tier].accent}66` }}>
            {TIER_SCENES[tier].label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Market">
            <input className="input py-2" value={market} onChange={(e) => setMarket(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Side">
            <select
              className="input py-2"
              value={side}
              onChange={(e) => setSide(e.target.value as PnlSide)}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </Field>
          <Field label="Leverage">
            <input
              className="input py-2"
              type="number"
              min={1}
              max={50}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Entry">
            <input
              className="input py-2"
              type="number"
              value={entry}
              onChange={(e) => setEntry(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Exit / Mark">
            <input
              className="input py-2"
              type="number"
              value={exit}
              onChange={(e) => setExit(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Size">
            <input
              className="input py-2"
              type="number"
              step="0.001"
              value={size}
              onChange={(e) => setSize(Number(e.target.value) || 0)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="chip cursor-pointer gap-2 normal-case tracking-normal">
            <input
              type="checkbox"
              checked={liquidated}
              onChange={(e) => setLiquidated(e.target.checked)}
            />
            Mark Liquidated
          </label>
          <button
            type="button"
            className="chip hover:bg-brown-500/20"
            onClick={() => setTierOverride("auto")}
          >
            <RefreshCw size={11} /> Auto ({autoTier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())})
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTierOverride(t)}
              className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] tracking-micro transition ${
                tier === t && tierOverride !== "auto"
                  ? "bg-brown-500 text-ink-950"
                  : tier === t
                    ? "border border-brown-400/40 bg-brown-500/15 text-brown-200"
                    : "bg-ink-800 text-cream-mute hover:bg-ink-700"
              }`}
            >
              {TIER_SCENES[t].label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-primary flex-1" disabled={busy} onClick={downloadPng}>
            <Download size={15} />
            {busy ? "Rendering…" : "Download PNG"}
          </button>
          <button className="btn-ghost flex-1" onClick={shareOnX}>
            <Share2 size={15} />
            Share On X
          </button>
        </div>
        <p className="text-[11px] text-cream-mute/55">
          Opens An X Draft With Caption Prefilled — No Auto-Posting. PNG Is Rendered In Your
          Browser From The Card Preview.
        </p>
      </div>

      <div className="flex justify-center lg:justify-end">
        <PnlCard ref={cardRef} snapshot={snapshot} tier={tier} oneLiner={oneLiner} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label-micro">{label}</span>
      {children}
    </label>
  );
}
