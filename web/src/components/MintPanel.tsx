"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Filter,
  Lock,
  Plus,
  Search,
  Skull,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { MintStats } from "@/lib/api";
import {
  loadAgentCatalog,
  titleCaseWords,
  traitEntries,
  type AgentCatalogEntry,
} from "@/lib/agents";

const TRAIT_FILTER_KEYS = [
  "eyewear",
  "accessory",
  "outfit",
  "bag",
  "held",
  "background",
  "headgear",
  "glasses",
] as const;

export function MintPanel({
  owner,
  busy,
  stats,
  alreadyMinted,
  mintedIds,
  onMint,
  onConnect,
  onTrade,
  expanded = false,
}: {
  owner: string | null;
  busy?: boolean;
  stats: MintStats | null;
  alreadyMinted?: boolean;
  /** Token ids already minted. Empty/undefined → treat all as available (contract undeployed). */
  mintedIds?: string[] | null;
  onMint: (payload: {
    rules: string;
    max_size: string;
    token_id: number;
  }) => Promise<void>;
  onConnect: () => void;
  /** Open the paper Trade desk for an agent. */
  onTrade?: (tokenId: number) => void;
  /** Full-width mint view (picker deserves room). */
  expanded?: boolean;
}) {
  const [rules, setRules] = useState("Long ETH At 3200, TP 3500, SL 3100");
  const [maxSize, setMaxSize] = useState("0.01");
  const [catalog, setCatalog] = useState<AgentCatalogEntry[]>([]);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [query, setQuery] = useState("");
  const [traitKey, setTraitKey] = useState<string>("");
  const [traitVal, setTraitVal] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AgentCatalogEntry | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const soldOut = !!stats?.sold_out;
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const id of mintedIds || []) set.add(String(id));
    for (const id of stats?.minted_ids || []) set.add(String(id));
    return set;
  }, [mintedIds, stats?.minted_ids]);

  useEffect(() => {
    let alive = true;
    setLoadingCatalog(true);
    loadAgentCatalog()
      .then((list) => {
        if (!alive) return;
        setCatalog(list);
        setCatalogErr(null);
        // Default pick: first available
        const firstFree = list.find((a) => !taken.has(String(a.id)));
        setSelectedId((cur) => cur ?? firstFree?.id ?? list[0]?.id ?? null);
      })
      .catch((e) => {
        if (!alive) return;
        setCatalogErr(e instanceof Error ? e.message : "Catalog Ghosted");
      })
      .finally(() => {
        if (alive) setLoadingCatalog(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const traitOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of catalog) {
      for (const [k, v] of traitEntries(a.traits)) {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k)!.add(v);
      }
    }
    return map;
  }, [catalog]);

  const filterKeys = useMemo(() => {
    const present = [...traitOptions.keys()];
    const preferred = TRAIT_FILTER_KEYS.filter((k) => present.includes(k));
    const rest = present.filter((k) => !preferred.includes(k as (typeof TRAIT_FILTER_KEYS)[number]));
    return [...preferred, ...rest];
  }, [traitOptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((a) => {
      if (onlyAvailable && taken.has(String(a.id))) return false;
      if (traitKey && traitVal) {
        const v = a.traits[traitKey];
        if (!v || v !== traitVal) return false;
      } else if (traitKey) {
        if (!a.traits[traitKey]) return false;
      }
      if (!q) return true;
      const hay = [
        a.name,
        String(a.id),
        ...traitEntries(a.traits).flatMap(([k, v]) => [k, v]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, query, traitKey, traitVal, onlyAvailable, taken]);

  const selected = useMemo(
    () => catalog.find((a) => a.id === selectedId) || null,
    [catalog, selectedId]
  );
  const selectedTaken = selected ? taken.has(String(selected.id)) : false;

  const picker = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-micro">Pick Your Agent</p>
          <h3 className="mt-0.5 text-sm font-semibold text-cream">
            Browse The Drop · {catalog.length || 100} Unique Desks
          </h3>
          <p className="mt-1 text-[11px] text-cream-mute">
            Choose The Vibe You Want To Clock In With. Taken Ones Stay On The Wall — Just Grey.
          </p>
        </div>
        <label className="chip cursor-pointer select-none hover:bg-brown-500/20">
          <input
            type="checkbox"
            className="sr-only"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          <Filter size={11} />
          {onlyAvailable ? "Available Only" : "Show All"}
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-mute"
          />
          <input
            className="input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Name, #Id, Or Trait…"
          />
        </label>
        <select
          className="input sm:w-40"
          value={traitKey}
          onChange={(e) => {
            setTraitKey(e.target.value);
            setTraitVal("");
          }}
        >
          <option value="">All Traits</option>
          {filterKeys.map((k) => (
            <option key={k} value={k}>
              {titleCaseWords(k.replace(/_/g, " "))}
            </option>
          ))}
        </select>
        {traitKey ? (
          <select
            className="input sm:max-w-xs sm:flex-1"
            value={traitVal}
            onChange={(e) => setTraitVal(e.target.value)}
          >
            <option value="">Any {titleCaseWords(traitKey)}</option>
            {[...(traitOptions.get(traitKey) || [])]
              .sort((a, b) => a.localeCompare(b))
              .map((v) => (
                <option key={v} value={v}>
                  {titleCaseWords(v.length > 48 ? `${v.slice(0, 48)}…` : v)}
                </option>
              ))}
          </select>
        ) : null}
      </div>

      {loadingCatalog ? (
        <div className="panel rounded-md border-dashed p-8 text-center text-sm text-cream-mute">
          Loading The Roster…
        </div>
      ) : catalogErr ? (
        <div className="panel rounded-md border-rust/30 p-6 text-center text-sm text-rust">
          {catalogErr}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel rounded-md border-dashed p-8 text-center text-sm text-cream-mute">
          No Agents Match That Filter. Ease Up On The Gatekeeping.
        </div>
      ) : (
        <div
          className={`grid gap-2 ${
            expanded
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {filtered.map((a) => {
            const isTaken = taken.has(String(a.id));
            const isSel = selectedId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={isTaken && !isSel}
                onClick={() => {
                  if (isTaken) {
                    setPreview(a);
                    return;
                  }
                  setSelectedId(a.id);
                }}
                onDoubleClick={() => setPreview(a)}
                className={`group relative overflow-hidden rounded-md border text-left transition ${
                  isSel
                    ? "border-brown-300 bg-brown-500/15 shadow-[0_0_0_1px_rgba(196,165,116,0.45)]"
                    : isTaken
                      ? "border-brown-400/10 bg-ink-900/50 opacity-55"
                      : "border-brown-400/15 bg-ink-900/70 hover:border-brown-400/40 hover:bg-ink-800"
                }`}
              >
                <div className="relative aspect-square overflow-hidden bg-ink-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.image}
                    alt={a.name}
                    loading="lazy"
                    className={`h-full w-full object-cover transition duration-300 ${
                      isTaken ? "grayscale" : "group-hover:scale-[1.03]"
                    }`}
                  />
                  {isTaken ? (
                    <span className="absolute left-1.5 top-1.5 rounded-sm bg-ink-950/85 px-1.5 py-0.5 font-mono text-[9px] tracking-micro text-rust">
                      Taken
                    </span>
                  ) : null}
                  {isSel ? (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brown-400 text-ink-950">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="absolute bottom-1.5 right-1.5 rounded-sm bg-ink-950/75 px-1.5 py-0.5 font-mono text-[9px] text-brown-200 opacity-0 transition group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(a);
                    }}
                  >
                    Peek
                  </button>
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-[11px] font-semibold text-cream">{a.name}</p>
                  <p className="font-mono text-[9px] text-cream-mute">#{a.id}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <p className="font-mono text-[10px] text-cream-mute/60">
        Showing {filtered.length} / {catalog.length || 0}
        {taken.size ? ` · ${taken.size} Taken` : " · All Open (Contract Not Live Yet)"}
      </p>
    </div>
  );

  const selectedStrip =
    selected ? (
      <div className="panel flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-brown-400/30 bg-ink-800 sm:h-20 sm:w-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.image} alt={selected.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="label-micro">Your Pick</p>
            <p className="truncate font-display text-base font-semibold text-cream sm:text-lg">
              {selected.name}
            </p>
            <p className="font-mono text-[10px] text-cream-mute">
              Bag Worker #{selected.id}
              {selectedTaken ? " · Already Taken" : " · Ready To Hire"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-bracket self-start sm:ml-auto"
          onClick={() => setPreview(selected)}
        >
          <Sparkles size={12} /> Traits
        </button>
        {onTrade && (
          <button type="button" className="btn-primary self-start px-3 py-2 text-xs" onClick={() => onTrade(selected.id)}>
            Open Trade Desk
          </button>
        )}
      </div>
    ) : null;

  const previewModal = (
    <AnimatePresence>
      {preview ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/75 p-3 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPreview(null)}
        >
          <motion.div
            className="panel max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-md p-4"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="label-micro">Agent Preview</p>
                <h3 className="font-display text-xl font-semibold text-cream">{preview.name}</h3>
                <p className="font-mono text-[11px] text-cream-mute">#{preview.id}</p>
              </div>
              <button className="btn-ghost px-2 py-1.5" onClick={() => setPreview(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="overflow-hidden rounded-md border border-brown-400/20 bg-ink-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.image} alt={preview.name} className="aspect-square w-full object-cover" />
            </div>
            <div className="mt-3 grid gap-1.5">
              {traitEntries(preview.traits).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-start justify-between gap-3 rounded-sm border border-brown-400/10 bg-ink-900/60 px-2.5 py-1.5"
                >
                  <span className="label-micro shrink-0 text-brown-300">
                    {titleCaseWords(k.replace(/_/g, " "))}
                  </span>
                  <span className="text-right text-[11px] text-cream-dim">
                    {titleCaseWords(v)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {taken.has(String(preview.id)) ? (
                <span className="chip border-rust/40 text-rust">Taken · Hunt A Transfer</span>
              ) : (
                <button
                  className="btn-primary flex-1"
                  onClick={() => {
                    setSelectedId(preview.id);
                    setPreview(null);
                  }}
                >
                  <Check size={14} /> Select {preview.name}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (!owner) {
    return (
      <>
        <motion.section
          layout
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel relative overflow-hidden rounded-md p-4 sm:p-5">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brown-600/10 via-transparent to-brown-800/10" />
            <div className="relative flex flex-col items-center gap-3.5 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-brown-400/25 bg-ink-800 text-brown-400">
                <Lock size={22} />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">Desk Locked · Browse Anyway</h2>
                <p className="mt-2 max-w-md text-sm text-cream-mute">
                  Window Shop The 100 Agents Below. Connect Meteor Or MyNearWallet (Testnet) When
                  You&apos;re Ready To Hire One.
                </p>
              </div>
              <button className="btn-primary" onClick={onConnect}>
                [ Connect Wallet ]
              </button>
            </div>
          </div>
          {picker}
        </motion.section>
        {previewModal}
      </>
    );
  }

  if (soldOut && !alreadyMinted) {
    return (
      <>
        <motion.section
          layout
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel relative overflow-hidden rounded-md border-rust/40 p-4 sm:p-5 sold-shake">
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-rust/15 blur-3xl" />
            <div className="relative flex flex-col items-center gap-3 py-3 text-center">
              <Skull className="text-rust" size={32} />
              <h2 className="font-display text-xl font-bold tracking-tight text-rust">
                Sold Out · 100/100
              </h2>
              <p className="max-w-sm text-sm text-cream-mute">
                Every Robot Already Clocked In. The Mint Button Took A Sabbatical. Hunt A Transfer,
                Bribe A Friend, Or Wait For The Sequel Drop.
              </p>
              <p className="font-mono text-[11px] text-cream-mute/60">
                Connected As {owner} · Zero Seats Left
              </p>
            </div>
          </div>
          {picker}
        </motion.section>
        {previewModal}
      </>
    );
  }

  if (alreadyMinted) {
    return (
      <>
        <motion.section
          layout
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel rounded-md p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brown-500/15 text-brown-300">
                <Wand2 size={16} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-cream">You Already Hired Yours</h2>
                <p className="mt-1 text-xs text-cream-mute">
                  One Agent Per Wallet On This Drop. Run The Desk, Or Transfer The NFT If You Want To
                  Hand The Keys Off. Still Peek The Gallery Below.
                </p>
                <p className="mt-2 font-mono text-[11px] text-cream-mute/55">{owner}</p>
              </div>
            </div>
          </div>
          {picker}
        </motion.section>
        {previewModal}
      </>
    );
  }

  return (
    <>
      <motion.section
        layout
        className="space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="panel rounded-md p-3.5 sm:p-4">
          <div className="mb-3.5 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brown-500/15 text-brown-300">
              <Wand2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Mint Your Bag Worker</h2>
              <p className="text-[11px] text-cream-mute">
                Pick One · Unique Traits · One / Wallet · In-App Only
              </p>
            </div>
          </div>

          {selectedStrip}

          <div className="mt-3 space-y-3">
            <label className="block space-y-1.5">
              <span className="label-micro">Starter Rules (Plain English)</span>
              <textarea
                className="input min-h-[84px] resize-y"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Long ETH At 3200, TP 3500, SL 3100"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="label-micro">Max Size (Safety Leash)</span>
              <input
                className="input"
                value={maxSize}
                onChange={(e) => setMaxSize(e.target.value)}
              />
            </label>
            <button
              className="btn-primary w-full"
              disabled={busy || soldOut || !selected || selectedTaken}
              onClick={() => {
                if (!selected || selectedTaken) return;
                void onMint({
                  rules,
                  max_size: maxSize,
                  token_id: selected.id,
                });
              }}
            >
              <Plus size={15} />
              {busy
                ? "Summoning…"
                : selected
                  ? `[ Mint ${selected.name} ]`
                  : "[ Pick An Agent First ]"}
            </button>
            <p className="text-center font-mono text-[10px] text-cream-mute/55">
              Minting As <span className="text-brown-300">{owner}</span>
              {selected ? (
                <>
                  {" "}
                  · #{selected.id}/{stats?.max_supply ?? 100}
                </>
              ) : null}{" "}
              · Testnet Vibes
            </p>
          </div>
        </div>

        {picker}
      </motion.section>
      {previewModal}
    </>
  );
}
