"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, Lock, MessageSquare, Pause, Play, Send, Share2, X } from "lucide-react";
import { toPng } from "html-to-image";
import { PnlCard } from "@/components/PnlCard";
import { buildShareText, computePnl, pickOneLiner, tierFromPnl, xIntentUrl, type PnlSnapshot } from "@/lib/pnl";
import { createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import { agentConfig, strategyParams, PERPS } from "@/lib/agentConfig";
import { fetchCandles, fetchMids, subscribeMarket, type Book, type Candle, type Trade } from "@/lib/hl";
import { evaluate, atr, fmtPx, upnl, liqPx, isLiquidated, type Decision, type Fill, type PendingOrder, type Position } from "@/lib/strategy";
import { agentEvents } from "@/lib/agentEvents";
import { withBase } from "@/lib/basePath";
import { AgentAvatar } from "@/components/AgentAvatar";
import { CHAT_EXAMPLES, parseIntent, type Level } from "@/lib/intent";
import { ASK_CHIPS, coinMentioned, converse, type TalkCtx } from "@/lib/talk";
import { clampLeverage, DEFAULT_LEVERAGE, MAX_LEVERAGE, writeLeverage } from "@/lib/leverage";

const START_EQUITY = 10_000;
type ChatMsg = { role: "you" | "agent"; text: string; time: number };
/** Pending chat order. sl/tp: undefined = not answered yet, null = explicitly skipped. */
type Draft = { side: "long" | "short"; coin?: string; usd?: number; sl?: Level | null; tp?: Level | null };
type Saved = { cash: number; positions: Position[]; orders: PendingOrder[]; fills: Fill[]; log: Decision[]; running: boolean;
  until: number | null; chat: ChatMsg[]; maxSize: number; maxLoss: number; defSl: Level | null; defTp: Level | null; lev: number; draft?: Draft | null; lossResetAt?: number; lastEvalAt?: number; lastCheckAt?: number; lastNote?: string; market?: string };
const empty = (): Saved => ({ cash: START_EQUITY, positions: [], orders: [], fills: [], log: [], running: false,
  until: null, chat: [], maxSize: 1000, maxLoss: 200, defSl: null, defTp: null, lev: DEFAULT_LEVERAGE, draft: null });
/** Strategy entry sizing: risk % of cash, capped at max size (floored so the guard never trips on rounding). */
function agentEntry(strat: ReturnType<typeof agentConfig>["strategy"], closed: Candle[], px: number, side: "long" | "short", s: Saved) {
  const a = atr(closed, strat.atrPeriod) || px * 0.002;
  const dir = side === "long" ? 1 : -1;
  const sl = px - dir * a * strat.slAtr, tp = px + dir * a * strat.tpAtr;
  const lev = clampLeverage(s.lev);
  const floor4 = (n: number) => { if (!(n > 0)) return 0; const e = Math.pow(10, Math.floor(Math.log10(n)) - 3); return Math.floor(n / e) * e; };
  let size = floor4((s.cash * (strat.riskPct / 100)) / (Math.abs(px - sl) * lev));
  if (size * px > s.maxSize) size = floor4((s.maxSize * 0.999) / px);
  return { size: +size.toPrecision(4), sl, tp, lev };
}
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const lvlTxt = (l: Level) => (l.pct ? `${l.value}%` : fmtPx(l.value));
const lvlPx = (l: Level, entry: number, side: "long" | "short", kind: "sl" | "tp") => {
  if (!l.pct) return l.value;
  const d = entry * (l.value / 100); const dir = side === "long" ? 1 : -1;
  return kind === "tp" ? entry + dir * d : entry - dir * d;
};
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Who closed a fill, for chart markers and history. */
const exitLabel = (f: Fill) =>
  f.reason === "Liquidated" ? "Liquidated"
  : f.reason === "Take Profit Hit" ? "TP Hit"
  : f.reason === "Stop Loss Hit" ? "SL Hit"
  : f.reason === "Closed By Owner" || f.reason === "Closed On Your Command" ? (f.side === "long" ? "Sold" : "Bought Back")
  : "Agent Closed";
const ownerLabel = (by: Fill["by"]) => (by === "agent-auto" ? "Agent" : "You");
const uid = () => Math.random().toString(36).slice(2, 10);
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const tstr = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function TradeView({ tokenId, accountId, isHolder, onConnect, onBack }: {
  tokenId: number; accountId: string | null; isHolder: boolean; onConnect: () => void; onBack: () => void;
}) {
  const cfg = useMemo(() => agentConfig(tokenId), [tokenId]);
  const [stMarket, setStMarket] = useState<string | undefined>(undefined);
  const coin = stMarket && (PERPS as readonly string[]).includes(stMarket) ? stMarket : cfg.market;
  const pc = useCallback((p: { coin?: string }) => p.coin ?? cfg.market, [cfg.market]);
  const key = accountId ? `pa:trade:${accountId}:${tokenId}` : null;
  const [st, setSt] = useState<Saved>(empty);
  const stRef = useRef(st); stRef.current = st;
  useEffect(() => { setStMarket(st.market); }, [st.market]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [mids, setMids] = useState<Record<string, number>>({});
  const midsRef = useRef(mids); midsRef.current = mids;
  const [book, setBook] = useState<Book>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [err, setErr] = useState<string | null>(null);
  const [size, setSize] = useState("0.01");
  const [limit, setLimit] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [name, setName] = useState(`Bag Worker #${tokenId}`);
  const candlesRef = useRef<Candle[]>([]);
  const lastEvalRef = useRef(0);
  const caughtUpRef = useRef(false);
  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [chartGen, setChartGen] = useState(0);
  const canTrade = isHolder && !!accountId;
  const pxOf = (c: string) => (c === coin ? price : midsRef.current[c] ?? null);

  // name from catalog
  useEffect(() => {
    fetch(withBase("/agents/metadata.json")).then((r) => r.json()).then((raw) => {
      const list = Array.isArray(raw) ? raw : raw.agents || raw.items || [];
      const row = list.find((a: { id?: number; token_id?: number }) => Number(a.id ?? a.token_id) === tokenId);
      if (row?.name) setName(String(row.name));
    }).catch(() => undefined);
  }, [tokenId]);

  // load / persist per wallet + agent
  useEffect(() => {
    let s = empty();
    if (key) try { const raw = localStorage.getItem(key); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch { /* ignore */ }
    s.lev = clampLeverage(s.lev);
    // Migrate legacy "agent" positions: chat opens used to share that tag with the strategy, so treat
    // them as the holder's (never auto-closed). Legacy agent fills count as strategy history.
    s.positions = s.positions.map((p) => (p.by === "agent" ? { ...p, by: "you" } : p));
    s.fills = s.fills.map((f) => (f.by === "agent" ? { ...f, by: "agent-auto" } : f));
    setSt(s); setLoadedKey(key);
    agentEvents.emit(s.running ? { type: "running" } : { type: "paused" });
  }, [key]);
  useEffect(() => { if (key && loadedKey === key) localStorage.setItem(key, JSON.stringify(st)); }, [st, key, loadedKey]);
  // share the leverage with the PnL card (same number on both)
  useEffect(() => { if (!key || loadedKey === key) writeLeverage(tokenId, st.lev); }, [st.lev, tokenId, key, loadedKey]);
  const [levText, setLevText] = useState(String(DEFAULT_LEVERAGE));
  useEffect(() => { setLevText(String(st.lev)); }, [st.lev]);
  const setLev = (v: unknown) => { const n = clampLeverage(v, stRef.current.lev); setSt((s) => ({ ...s, lev: n })); setLevText(String(n)); return n; };

  const log = useCallback((text: string) => setSt((s) => ({ ...s, log: [{ time: Date.now(), text }, ...s.log].slice(0, 200),
    chat: [...s.chat, { role: "agent" as const, text, time: Date.now() }].slice(-200) })), []);
  const say = useCallback((text: string) => {
    setSt((s) => ({ ...s, chat: [...s.chat, { role: "agent" as const, text, time: Date.now() }].slice(-200) }));
    agentEvents.emit({ type: "say", text });
  }, []);
  const dailyPnl = (s: Saved) => { const from = Math.max(startOfDay(), s.lossResetAt ?? 0); return s.fills.filter((f) => f.closedAt >= from).reduce((a, f) => a + f.pnl, 0); };
  /** Hard guardrails checked before every order. */
  const guard = useCallback((notional: number): string | null => {
    const s = stRef.current;
    if (dailyPnl(s) <= -s.maxLoss) return `Blocked: Daily Loss Limit Of ${usd(s.maxLoss)} Already Hit. Raise It With "Set Max Daily Loss X" Or Try Tomorrow.`;
    if (notional > s.maxSize + 1e-6) return `Blocked: ${usd(notional)} Is Over Your Max Position Size Of ${usd(s.maxSize)}.`;
    return null;
  }, []);

  const closePos = useCallback((p: Position, px: number, reason: string) => {
    const pnl = upnl(p, px);
    setSt((s) => ({
      ...s, cash: s.cash + pnl, positions: s.positions.filter((x) => x.id !== p.id),
      fills: [{ id: p.id, side: p.side, size: p.size, entry: p.entry, exit: px, pnl, openedAt: p.openedAt, closedAt: Date.now(), by: p.by, reason, lev: p.lev, coin: p.coin ?? cfg.market }, ...s.fills].slice(0, 300),
    }));
    if (reason === "Liquidated") {
      log(`Liquidated · ${p.side === "long" ? "Long" : "Short"} ${p.lev ?? 1}x Wiped At ${fmtPx(px)} · ${usd(pnl)} (100% Of Margin)`);
      agentEvents.emit({ type: "loss", pnl, reason });
    } else if (p.by !== "manual") {
      log(`${reason} · ${p.side === "long" ? "Long" : "Short"} Closed At ${fmtPx(px)} · ${pnl >= 0 ? "+" : ""}${usd(pnl)}`);
      agentEvents.emit(pnl >= 0 ? { type: "win", pnl, reason } : { type: "loss", pnl, reason });
    }
  }, [log, cfg.market]);

  // price tick: TP/SL + limit fills + agent eval on new closed candle
  const onTick = useCallback((px: number) => {
    const s = stRef.current;
    for (const p of s.positions) {
      if (pc(p) !== coin) continue;
      if (isLiquidated(p, px)) { closePos(p, liqPx(p), "Liquidated"); continue; }
      const hitTp = p.tp != null && (p.side === "long" ? px >= p.tp : px <= p.tp);
      const hitSl = p.sl != null && (p.side === "long" ? px <= p.sl : px >= p.sl);
      if (hitTp) closePos(p, p.tp!, "Take Profit Hit");
      else if (hitSl) closePos(p, p.sl!, "Stop Loss Hit");
    }
    for (const o of s.orders) {
      if (pc(o) !== coin) continue;
      if ((o.side === "long" && px <= o.limit) || (o.side === "short" && px >= o.limit)) {
        setSt((x) => ({ ...x, orders: x.orders.filter((y) => y.id !== o.id), positions: [...x.positions, { id: o.id, side: o.side, size: o.size, entry: o.limit, tp: o.tp, sl: o.sl, openedAt: Date.now(), by: "manual", lev: clampLeverage(o.lev ?? x.lev), coin: pc(o) }] }));
      }
    }
    // agent
    const cs = candlesRef.current;
    if (!s.running || !canTrade || cs.length < 3 || !caughtUpRef.current) return;
    if (s.until && Date.now() > s.until) {
      setSt((x) => ({ ...x, running: false, until: null }));
      say("Session Expired, Pausing. Closing Up Shop Like A Responsible Bag."); agentEvents.emit({ type: "paused" }); return;
    }
    if (dailyPnl(s) <= -s.maxLoss) {
      setSt((x) => ({ ...x, running: false, until: null }));
      say(`Daily Loss Limit Of ${usd(s.maxLoss)} Hit. Auto-Paused. This Is Fine.`); agentEvents.emit({ type: "paused" }); return;
    }
    const closed = cs.slice(0, -1);
    const lastClosed = closed[closed.length - 1].time;
    if (lastClosed === lastEvalRef.current) return;
    lastEvalRef.current = lastClosed;
    const mine = stRef.current.positions.find((p) => p.by === "agent-auto" && pc(p) === coin) || null;
    const sig = evaluate(cfg.strategy, closed, mine?.side ?? null);
    const note = !sig.action ? (mine ? `In A ${mine.side === "long" ? "Long" : "Short"}, Waiting For Exit` : "Watching, No Setup Yet") : sig.reason;
    setSt((x) => ({ ...x, lastEvalAt: lastClosed, lastCheckAt: Date.now(), lastNote: note }));
    if (!sig.action) return;
    if (sig.action === "close" && mine) { closePos(mine, px, sig.reason); return; }
    if ((sig.action === "long" || sig.action === "short") && !mine) {
      const o = agentEntry(cfg.strategy, closed, px, sig.action, stRef.current);
      const blocked = guard(o.size * px);
      if (blocked) { log(`Skipped Signal (${sig.reason}). ${blocked}`); setSt((x) => ({ ...x, lastNote: `Skipped A Signal: ${blocked.replace(/^Blocked: /, "")}` })); return; }
      setSt((x) => ({ ...x, positions: [...x.positions, { id: uid(), side: sig.action as "long" | "short", size: o.size, entry: px, tp: o.tp, sl: o.sl, openedAt: Date.now(), by: "agent-auto", lev: o.lev, coin }] }));
      log(`${sig.reason} · ${o.size} ${coin} @ ${fmtPx(px)} · ${o.lev}x · TP ${fmtPx(o.tp)} · SL ${fmtPx(o.sl)}`);
      say(`${sig.reason} · ${fmtPx(px)} · TP ${fmtPx(o.tp)} · SL ${fmtPx(o.sl)}`);
      agentEvents.emit({ type: "entry", side: sig.action, reason: sig.reason });
    }
  }, [canTrade, cfg, closePos, coin, log, say, guard, pc]);
  const tickRef = useRef(onTick); tickRef.current = onTick;

  // Other markets: poll mids so positions there show live uPnL and still hit TP / SL / liquidation.
  useEffect(() => {
    let alive = true;
    const poll = () => fetchMids().then((m) => { if (alive) setMids(m); }).catch(() => undefined);
    poll(); const id = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    const s = stRef.current;
    for (const p of s.positions) {
      const c = pc(p); if (c === coin) continue;
      const q = mids[c]; if (q == null) continue;
      if (isLiquidated(p, q)) { closePos(p, liqPx(p), "Liquidated"); continue; }
      if (p.tp != null && (p.side === "long" ? q >= p.tp : q <= p.tp)) closePos(p, p.tp, "Take Profit Hit");
      else if (p.sl != null && (p.side === "long" ? q <= p.sl : q >= p.sl)) closePos(p, p.sl, "Stop Loss Hit");
    }
    for (const o of s.orders) {
      const c = pc(o); if (c === coin) continue; const q = mids[c]; if (q == null) continue;
      if ((o.side === "long" && q <= o.limit) || (o.side === "short" && q >= o.limit))
        setSt((x) => ({ ...x, orders: x.orders.filter((y) => y.id !== o.id), positions: [...x.positions, { id: o.id, side: o.side, size: o.size, entry: o.limit, tp: o.tp, sl: o.sl, openedAt: Date.now(), by: "manual", lev: clampLeverage(o.lev ?? x.lev), coin: c }] }));
    }
  }, [mids, coin, pc, closePos]);

  const switchMarket = (m: string) => {
    if (m === coin) return;
    setPrice(null);
    setSt((x) => ({ ...x, market: m, lastEvalAt: undefined, lastNote: x.running ? `Switched To ${m}, Warming Up` : x.lastNote }));
    if (stRef.current.running) say(`Switched To ${m}-PERP. Same Strategy, New Market. Positions On Other Markets Keep Their TP / SL.`);
  };

  /** Replay closed candles missed while the tab was closed or the phone slept, so a timed session still trades (paper). */
  const catchUp = useCallback(() => {
    const cs = candlesRef.current;
    const s0 = stRef.current;
    const closedAll = cs.slice(0, -1);
    const lastT = closedAll[closedAll.length - 1]?.time ?? 0;
    if (!closedAll.length || !canTrade) return;
    if (!s0.running || !canTrade || !s0.lastEvalAt || s0.lastEvalAt >= lastT) {
      lastEvalRef.current = lastT; caughtUpRef.current = true;
      if (s0.running && canTrade) setSt((x) => ({ ...x, lastEvalAt: lastT, lastCheckAt: Date.now() }));
      return;
    }
    const endMs = s0.until ? Math.min(s0.until, Date.now()) : Date.now();
    let s: Saved = { ...s0, positions: [...s0.positions], fills: [...s0.fills] };
    let entries = 0, exits = 0, bars = 0, processed = s0.lastEvalAt, stopped = "";
    const exitAt = (p: Position, px: number, at: number, reason: string) => {
      const pnl = upnl(p, px); exits++;
      s = { ...s, cash: s.cash + pnl, positions: s.positions.filter((x) => x.id !== p.id),
        fills: [{ id: p.id, side: p.side, size: p.size, entry: p.entry, exit: px, pnl, openedAt: p.openedAt, closedAt: at, by: p.by, reason: `${reason} (Caught Up)`, lev: p.lev, coin: pc(p) }, ...s.fills].slice(0, 300) };
    };
    for (let i = 0; i < closedAll.length; i++) {
      const c = closedAll[i];
      if (c.time <= s0.lastEvalAt) continue;
      const at = c.time * 1000 + 59_000;
      if (c.time * 1000 > endMs) break;
      bars++; processed = c.time;
      for (const p of [...s.positions]) {
        if (pc(p) !== coin) continue;
        const long = p.side === "long";
        if (long ? c.low <= liqPx(p) : c.high >= liqPx(p)) { exitAt(p, liqPx(p), at, "Liquidated"); continue; }
        if (p.sl != null && (long ? c.low <= p.sl : c.high >= p.sl)) { exitAt(p, p.sl, at, "Stop Loss Hit"); continue; }
        if (p.tp != null && (long ? c.high >= p.tp : c.low <= p.tp)) exitAt(p, p.tp, at, "Take Profit Hit");
      }
      if (dailyPnl(s) <= -s.maxLoss) { stopped = `Daily Loss Limit Of ${usd(s.maxLoss)} Hit While You Were Away, Auto-Paused.`; break; }
      const win = closedAll.slice(Math.max(0, i - 299), i + 1);
      const mine = s.positions.find((p) => p.by === "agent-auto" && pc(p) === coin) || null;
      const sig = evaluate(cfg.strategy, win, mine?.side ?? null);
      if (sig.action === "close" && mine) exitAt(mine, c.close, at, sig.reason);
      else if ((sig.action === "long" || sig.action === "short") && !mine) {
        const o = agentEntry(cfg.strategy, win, c.close, sig.action, s);
        if (o.size > 0 && o.size * c.close <= s.maxSize + 1e-6) {
          entries++;
          s = { ...s, positions: [...s.positions, { id: uid(), side: sig.action, size: o.size, entry: c.close, tp: o.tp, sl: o.sl, openedAt: c.time * 1000, by: "agent-auto", lev: o.lev, coin }] };
        }
      }
    }
    const expired = !!s0.until && Date.now() > s0.until;
    s = { ...s, lastEvalAt: processed, lastCheckAt: Date.now(), ...(stopped || expired ? { running: false, until: null } : {}) };
    lastEvalRef.current = expired || stopped ? lastT : processed; caughtUpRef.current = true;
    const pnlNow = s.cash - s0.cash;
    const msg = `Back Online. Caught Up ${bars} Missed Candle${bars === 1 ? "" : "s"} · ${entries} Entr${entries === 1 ? "y" : "ies"} · ${exits} Exit${exits === 1 ? "" : "s"} · ${pnlNow >= 0 ? "+" : ""}${usd(pnlNow)}.`;
    s = { ...s, chat: [...s.chat, { role: "agent" as const, text: msg, time: Date.now() }, ...(stopped ? [{ role: "agent" as const, text: stopped, time: Date.now() }] : []),
      ...(expired && !stopped ? [{ role: "agent" as const, text: "Session Ended While You Were Away, Paused.", time: Date.now() }] : [])].slice(-200) };
    setSt(s); stRef.current = s;
    if (stopped || expired) agentEvents.emit({ type: "paused" });
  }, [canTrade, cfg, coin, pc]);

  // run catch-up once the saved state and candles are both loaded, and again whenever the tab comes back
  useEffect(() => { caughtUpRef.current = false; }, [key, coin]);
  useEffect(() => {
    if (!chartGen || loadedKey !== key || caughtUpRef.current) return;
    catchUp();
  }, [chartGen, loadedKey, key, canTrade, catchUp]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") return;
      caughtUpRef.current = false;
      fetchCandles(coin).then((fresh) => {
        const arr = candlesRef.current;
        const map = new Map(arr.map((c) => [c.time, c]));
        for (const c of fresh) map.set(c.time, c);
        candlesRef.current = [...map.values()].sort((a, b) => a.time - b.time).slice(-600);
        try { seriesRef.current?.setData(candlesRef.current.map((c) => ({ ...c, time: c.time as UTCTimestamp }))); } catch { /* chart gone */ }
        catchUp();
      }).catch(() => { caughtUpRef.current = true; });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [coin, catchUp]);

  // chart + data
  useEffect(() => {
    if (!chartEl.current) return;
    const chart = createChart(chartEl.current, {
      autoSize: true,
      layout: { background: { color: "#0a0908" }, textColor: "#b8aea0", fontSize: 11 },
      grid: { vertLines: { color: "rgba(196,165,116,0.06)" }, horzLines: { color: "rgba(196,165,116,0.06)" } },
      rightPriceScale: { borderColor: "rgba(196,165,116,0.2)" },
      timeScale: { borderColor: "rgba(196,165,116,0.2)", timeVisible: true },
    });
    const series = chart.addCandlestickSeries({ upColor: "#c4a574", downColor: "#5c3d24", wickUpColor: "#c4a574", wickDownColor: "#7a5230", borderVisible: false });
    chartRef.current = chart; seriesRef.current = series;
    let stop = () => {};
    let alive = true;
    candlesRef.current = []; lastEvalRef.current = 0;
    fetchCandles(coin).then((cs) => {
      if (!alive) return;
      candlesRef.current = cs;
      series.setData(cs.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
      if (cs.length) { setPrice(cs[cs.length - 1].close); lastEvalRef.current = cs[cs.length - 2]?.time ?? 0; }
      priceLinesRef.current = []; setChartGen((g) => g + 1);
      stop = subscribeMarket(coin, {
        onStatus: setStatus,
        onCandle: (c) => {
          const arr = candlesRef.current;
          if (arr.length && arr[arr.length - 1].time === c.time) arr[arr.length - 1] = c;
          else if (!arr.length || c.time > arr[arr.length - 1].time) { arr.push(c); if (arr.length > 600) arr.shift(); }
          series.update({ ...c, time: c.time as UTCTimestamp });
          setPrice(c.close); tickRef.current(c.close);
        },
        onBook: setBook,
        onTrades: (t) => { if (!t.length) return; setTrades((x) => [...t.reverse(), ...x].slice(0, 40)); setPrice(t[0].px); tickRef.current(t[0].px); },
      });
    }).catch((e) => setErr(e instanceof Error ? e.message : "Market Data Failed"));
    return () => { alive = false; stop(); chart.remove(); };
  }, [coin]);

  // chart overlays: entry / TP / SL / Liq price lines and entry + exit markers
  useEffect(() => {
    const series = seriesRef.current; if (!series || !chartGen) return;
    for (const l of priceLinesRef.current) { try { series.removePriceLine(l); } catch { /* chart gone */ } }
    priceLinesRef.current = [];
    const add = (price: number | undefined, color: string, title: string, lineStyle: LineStyle, lineWidth: 1 | 2) => {
      if (price == null || !Number.isFinite(price)) return;
      priceLinesRef.current.push(series.createPriceLine({ price, color, title, lineStyle, lineWidth, axisLabelVisible: true }));
    };
    for (const p of st.positions) {
      if (pc(p) !== coin) continue;
      const long = p.side === "long";
      add(p.entry, long ? "#22c55e" : "#ef4444", `${long ? "Long" : "Short"} @ ${fmtPx(p.entry)}`, LineStyle.Dashed, 2);
      add(p.tp, "#22c55e", "TP", LineStyle.Dotted, 1);
      add(p.sl, "#ef4444", "SL", LineStyle.Dotted, 1);
      add(liqPx(p), "#f97316", "Liq", LineStyle.Dotted, 1);
    }
    const cs = candlesRef.current;
    if (!cs.length) { series.setMarkers([]); return; }
    const step = cs.length > 1 ? cs[cs.length - 1].time - cs[cs.length - 2].time : 60;
    const first = cs[0].time;
    const bar = (ms: number) => { const t = Math.floor(ms / 1000 / step) * step; return t >= first ? (t as UTCTimestamp) : null; };
    const mk: SeriesMarker<Time>[] = [];
    const entry = (side: "long" | "short", at: number, px: number) => {
      const t = bar(at); if (t == null) return;
      mk.push(side === "long"
        ? { time: t, position: "belowBar", shape: "arrowUp", color: "#22c55e", text: `Long @ ${fmtPx(px)}` }
        : { time: t, position: "aboveBar", shape: "arrowDown", color: "#ef4444", text: `Short @ ${fmtPx(px)}` });
    };
    for (const p of st.positions) if (pc(p) === coin) entry(p.side, p.openedAt, p.entry);
    for (const f of st.fills) {
      if (pc(f) !== coin) continue;
      entry(f.side, f.openedAt, f.entry);
      const t = bar(f.closedAt); if (t == null) continue;
      const pnlTxt = `${f.pnl >= 0 ? "+" : "-"}$${Math.abs(f.pnl).toFixed(2)}`;
      mk.push({ time: t, position: f.side === "long" ? "aboveBar" : "belowBar", shape: f.side === "long" ? "arrowDown" : "arrowUp",
        color: f.pnl >= 0 ? "#22c55e" : "#ef4444", text: `${exitLabel(f)} @ ${fmtPx(f.exit)} ${pnlTxt}` });
    }
    mk.sort((a, b) => (a.time as number) - (b.time as number));
    series.setMarkers(mk);
  }, [st.positions, st.fills, chartGen, coin, pc]);

  const place = (side: "long" | "short", kind: "market" | "limit") => {
    if (!canTrade || price == null) return;
    const sz = Number(size); if (!(sz > 0)) return;
    const blocked = guard(sz * (kind === "limit" ? Number(limit) || price : price));
    if (blocked) { say(blocked); return; }
    const tpN = tp ? Number(tp) : undefined, slN = sl ? Number(sl) : undefined;
    if (kind === "limit") {
      const l = Number(limit); if (!(l > 0)) return;
      setSt((s) => ({ ...s, orders: [...s.orders, { id: uid(), side, size: sz, limit: l, tp: tpN, sl: slN, createdAt: Date.now(), lev: s.lev, coin }] }));
    } else {
      setSt((s) => ({ ...s, positions: [...s.positions, { id: uid(), side, size: sz, entry: price, tp: tpN, sl: slN, openedAt: Date.now(), by: "manual", lev: s.lev, coin }] }));
    }
  };

  const [startMsg, setStartMsg] = useState<string | null>(null);
  const toggleAgent = () => {
    if (!canTrade) return;
    const running = !st.running;
    if (running && dailyPnl(st) <= -st.maxLoss) { setStartMsg(`Can't Start, Daily Loss Limit Of ${usd(st.maxLoss)} Is Hit. Raise It First.`); return; }
    setStartMsg(null);
    setSt((s) => ({ ...s, running, until: running ? s.until : null, ...(running ? { lastEvalAt: lastEvalRef.current || s.lastEvalAt, lastCheckAt: Date.now(), lastNote: "Watching, No Setup Yet" } : {}) }));
    log(running ? `Agent Started · ${cfg.strategy.label} On ${coin}` : "Agent Paused By Owner");
    agentEvents.emit(running ? { type: "running" } : { type: "paused" });
  };

  const [input, setInput] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [st.chat.length]);

  const draftTxt = (d: Draft) => `${d.side === "long" ? "Long" : "Short"} ${d.coin ?? coin} · ${d.usd != null ? usd(d.usd) + " Margin" : "Margin ?"} · ${stRef.current.lev}x · SL ${d.sl === null ? "None" : d.sl ? lvlTxt(d.sl) : "?"} · TP ${d.tp === null ? "None" : d.tp ? lvlTxt(d.tp) : "?"}`;
  const askDraft = (d: Draft) => {
    const missing: string[] = [];
    if (d.usd == null || !(d.usd > 0)) missing.push("How Much Margin?");
    if (d.sl === undefined) missing.push("Stop Loss? (e.g. SL 2% Or No SL)");
    if (d.tp === undefined) missing.push("Take Profit? (e.g. TP 4% Or No TP)");
    if (missing.length) say(`Draft: ${draftTxt(d)}. ${missing.join(" ")} Say Cancel To Drop It.`);
    else say(`Ready: ${draftTxt(d)}. Reply Confirm To Open, Or Cancel.`);
  };
  const confirmDraft = (d: Draft) => {
    const dc = d.coin ?? coin;
    const px = pxOf(dc);
    if (d.usd == null || !(d.usd > 0) || d.sl === undefined || d.tp === undefined) { askDraft(d); return; }
    if (px == null) { say("No Live Price Yet. Give The Feed A Second, Then Confirm Again."); return; }
    const notional = d.usd;
    const blocked = guard(notional); if (blocked) { say(blocked); return; }
    const slL = d.sl ?? undefined, tpL = d.tp ?? undefined;
    const sz = +(notional / px).toPrecision(4);
    setSt((x) => ({ ...x, draft: null, positions: [...x.positions, { id: uid(), side: d.side, size: sz, entry: px,
      sl: slL ? lvlPx(slL, px, d.side, "sl") : undefined, tp: tpL ? lvlPx(tpL, px, d.side, "tp") : undefined, openedAt: Date.now(), by: "you", lev: x.lev, coin: dc }] }));
    say(`Done, Opened A ${d.side === "long" ? "Long" : "Short"} On ${dc} For ${usd(notional)} Margin At ${stRef.current.lev}x @ ${fmtPx(px)}${slL ? ` With SL At ${lvlTxt(slL)}` : ""}${tpL ? `${slL ? " And" : " With"} TP At ${lvlTxt(tpL)}` : ""}.`);
    if (stRef.current.running) say("Heads Up: The Agent Strategy Is Running, But It Won't Touch This One. Your Position Only Closes When You Close It, Or On Your TP, SL Or Liquidation.");
    agentEvents.emit({ type: "entry", side: d.side, reason: `${d.side === "long" ? "Long" : "Short"} ${dc} On Your Call` });
  };
  const lvl = (raw: string): Level => { const m = raw.match(/\$?([\d.,]+)\s*(%)?/)!; return { value: Number(m[1].replace(/,/g, "")), pct: Boolean(m[2]) }; };

  const topicRef = useRef<string | undefined>(undefined);
  const handle = (text: string) => {
    const msg = text.trim(); if (!msg) return;
    setSt((s) => ({ ...s, chat: [...s.chat, { role: "you" as const, text: msg, time: Date.now() }].slice(-200) }));
    setInput("");
    if (!canTrade) { say("I Only Take Orders From My Holder. Connect The Wallet That Owns Me To Chat Trades."); return; }
    const s = stRef.current;
    const px = price;
    const lo = msg.toLowerCase();
    const parsedOpen = parseIntent(msg);
    // Questions and casual talk go to the conversational layer, grounded in live state.
    const talkCtx = (): TalkCtx => ({ name, coin, strategy: cfg.strategy, closed: candlesRef.current.slice(0, -1), price: px, running: s.running, until: s.until,
      lastNote: s.lastNote, lastCheckAt: s.lastCheckAt, positions: s.positions, priceOf: (c: string) => midsRef.current[c] ?? null, defaultCoin: cfg.market, fills: s.fills, cash: s.cash, lev: s.lev, maxSize: s.maxSize, maxLoss: s.maxLoss,
      today: dailyPnl(s), lastTopic: topicRef.current });
    const isQuestion = /^(what|whats|why|how|hows|should|is|are|do|does|did|when|would|will|who|where|explain|tell me|any|thoughts|opinion)\b/.test(lo) || /\?\s*$/.test(lo);
    const draftReply = s.draft && ["confirm", "cancel", "set_sl", "set_tp"].includes(parsedOpen.kind);
    if (!draftReply && (parsedOpen.kind === "unknown" || (isQuestion && !/^(can|could) you\b/.test(lo)))) {
      const other = coinMentioned(msg);
      if (other && other !== coin && (PERPS as readonly string[]).includes(other)) {
        fetchCandles(other).then((cs) => {
          const rep = converse(msg, { ...talkCtx(), coin: other, closed: cs.slice(0, -1), price: midsRef.current[other] ?? cs[cs.length - 1]?.close ?? null,
            priceOf: (c: string) => (c === coin ? px : midsRef.current[c] ?? null) });
          if (rep) { topicRef.current = rep.topic; say(`${rep.text}${coin !== other && rep.topic !== "explain" ? ` (I'm Trading ${coin} Right Now. Tap ${other} Up Top To Switch Me.)` : ""}`); }
          else say(`Couldn't Read ${other} Right Now. Try Again In A Second.`);
        }).catch(() => say(`Couldn't Load ${other} Candles. Try Again In A Second.`));
        return;
      }
      const rep = converse(msg, talkCtx());
      if (rep && !(rep.topic === "fallback" && parsedOpen.kind !== "unknown")) { topicRef.current = rep.topic; say(rep.text); return; }
    }
    // A pending draft only captures direct answers to it; any other command runs right away.
    const draftAnswer = ["confirm", "cancel", "set_sl", "set_tp", "unknown"].includes(parsedOpen.kind);
    if (s.draft && !draftAnswer && parsedOpen.kind !== "open") {
      setSt((x) => ({ ...x, draft: null })); stRef.current = { ...stRef.current, draft: null };
      say("Dropped The Pending Order Draft, Doing This Instead.");
    }
    if (!s.draft && (parsedOpen.kind === "confirm" || parsedOpen.kind === "cancel")) { say(parsedOpen.kind === "confirm" ? "Nothing Pending To Confirm. Try \"Long BTC 100\" First." : "Nothing Pending To Cancel. All Clear."); return; }
    if (s.draft && draftAnswer) {
      const d: Draft = { ...s.draft };
      if (parsedOpen.kind === "cancel") { setSt((x) => ({ ...x, draft: null })); say("Done, Draft Dropped. Nothing Opened."); return; }
      if (parsedOpen.kind === "confirm") { confirmDraft(d); return; }
      let touched = false;
      if (/\bno\s*(sl|stop\s*loss)\b/.test(lo)) { d.sl = null; touched = true; }
      if (/\bno\s*(tp|take\s*profit)\b/.test(lo)) { d.tp = null; touched = true; }
      const slM = lo.match(/(?:\bsl\b|stop\s*loss)\s*(?:at|to|=)?\s*(\$?[\d.,]+\s*%?)/);
      const tpM = lo.match(/(?:\btp\b|take\s*profit)\s*(?:at|to|=)?\s*(\$?[\d.,]+\s*%?)/);
      if (slM) { d.sl = lvl(slM[1]); touched = true; }
      if (tpM) { d.tp = lvl(tpM[1]); touched = true; }
      const rest = lo.replace(/(?:\bsl\b|stop\s*loss|\btp\b|take\s*profit)\s*(?:at|to|=)?\s*\$?[\d.,]+\s*%?/g, " ");
      const mM = rest.match(/(?:^|\s)(?:margin\s*)?\$?([\d][\d,]*(?:\.\d+)?)(?:\s*(?:usd|dollars|margin))?(?:\s|$)/);
      if (mM) { d.usd = Number(mM[1].replace(/,/g, "")); touched = true; }
      if (touched) { setSt((x) => ({ ...x, draft: d })); askDraft(d); return; }
      if (parsedOpen.kind === "unknown") { say(`Still Holding Your Draft. Reply With The Missing Bits, "Confirm" Or "Cancel". Or Just Give Me A New Command.`); askDraft(d); return; }
    }
    const it = parsedOpen;
    switch (it.kind) {
      case "help":
        say(`I Trade ${coin}-PERP With ${cfg.strategy.label}, Paper Only. Try: ${CHAT_EXAMPLES.join(" · ")}`); return;
      case "status": {
        const u = s.positions.reduce((a, p) => { const q = pxOf(pc(p)); return a + (q != null ? upnl(p, q) : 0); }, 0);
        const af = s.fills.filter((f) => f.by === "agent-auto"); const w = af.filter((f) => f.pnl > 0).length;
        say(`${s.running ? "Running" : "Paused"} · ${s.positions.length} Open · uPnL ${usd(u)} · Realized ${usd(s.fills.reduce((a, f) => a + f.pnl, 0))} · Today ${usd(dailyPnl(s))} · Agent Win Rate ${af.length ? Math.round((w / af.length) * 100) + "%" : "—"} · Leverage ${s.lev}x · Max Size ${usd(s.maxSize)} · Max Daily Loss ${usd(s.maxLoss)}`); return;
      }
      case "leverage": {
        const n = setLev(it.value);
        say(`Done, Leverage Set To ${n}x${it.value > MAX_LEVERAGE ? ` (Capped At ${MAX_LEVERAGE}x)` : ""}. Applies To New Positions; Open Ones Keep Their Leverage. Liquidation At A ${(100 / n).toFixed(n >= 100 ? 2 : 1)}% Move Against You.`); return;
      }
      case "max_size": setSt((x) => ({ ...x, maxSize: it.usd })); say(`Done, Max Position Size Set To ${usd(it.usd)}.`); return;
      case "max_loss": setSt((x) => ({ ...x, maxLoss: it.usd })); say(`Done, Max Daily Loss Set To ${usd(it.usd)}. I Auto-Pause If We Hit It.`); return;
      case "pause":
        if (!s.running) { say("Already Paused. Snoozing Harder."); return; }
        setSt((x) => ({ ...x, running: false, until: null })); say("Done, Paused. Open Positions Keep Their TP / SL."); agentEvents.emit({ type: "paused" }); return;
      case "resume": case "trade_for_me": {
        if (dailyPnl(s) <= -s.maxLoss) { say(`Can't, Daily Loss Limit Of ${usd(s.maxLoss)} Is Hit. Raise It First.`); return; }
        const until = it.kind === "trade_for_me" && it.hours === "today" ? startOfDay() + 86_400_000
          : it.kind === "trade_for_me" && typeof it.hours === "number" ? Date.now() + it.hours * 3_600_000 : null;
        setSt((x) => ({ ...x, running: true, until, lastEvalAt: lastEvalRef.current || x.lastEvalAt, lastCheckAt: Date.now(), lastNote: "Watching, No Setup Yet" }));
        say(`Done, Running ${cfg.strategy.label} On ${coin}${until ? ` Until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " Until You Say Pause"}. I'll Post Every Entry And Exit Here.`);
        agentEvents.emit({ type: "running" }); return;
      }
      case "set_sl": case "set_tp": {
        const k = it.kind === "set_sl" ? "sl" : "tp";
        setSt((x) => ({ ...x, [k === "sl" ? "defSl" : "defTp"]: it.level,
          positions: x.positions.map((p) => ({ ...p, [k]: lvlPx(it.level, p.entry, p.side, k) })) }));
        say(`Done, ${k === "sl" ? "Stop Loss" : "Take Profit"} Set At ${lvlTxt(it.level)} On ${s.positions.length} Open Position${s.positions.length === 1 ? "" : "s"} And Future Orders.`); return;
      }
      case "close": {
        const targets = s.positions.filter((p) => !it.coin || pc(p) === it.coin);
        if (!targets.length) { say(it.coin ? `Nothing Open On ${it.coin}.` : "Nothing Open. The Desk Is Already Clean."); return; }
        let n = 0; const skipped: string[] = [];
        for (const p of targets) { const q = pxOf(pc(p)); if (q == null) { skipped.push(pc(p)); continue; } closePos(p, q, "Closed On Your Command"); n++; }
        const mk = [...new Set(targets.map(pc))].join(", ");
        say(`Done, Closed ${n} Position${n === 1 ? "" : "s"} On ${mk}.${skipped.length ? ` No Price Yet For ${skipped.join(", ")}, Try Again In A Second.` : ""}`); return;
      }
      case "open": {
        const oc = it.coin && (PERPS as readonly string[]).includes(it.coin) ? it.coin : coin;
        if (it.coin && oc !== it.coin) { say(`${it.coin} Is Not On The Desk. Markets: ${PERPS.join(", ")}.`); return; }
        if (pxOf(oc) == null) { say(`No Live Price For ${oc} Yet. Give The Feed A Second.`); return; }
        const d: Draft = { side: it.side, coin: oc, usd: it.usd ?? undefined, sl: it.sl ?? s.defSl ?? undefined, tp: it.tp ?? s.defTp ?? undefined };
        if (/\bno\s*(sl|stop\s*loss|stop)\b/.test(lo)) d.sl = null;
        if (/\bno\s*(tp|take\s*profit|target)\b/.test(lo)) d.tp = null;
        setSt((x) => ({ ...x, draft: d }));
        askDraft(d); return;
      }
      case "confirm": case "cancel": return;
      default:
        say(`Didn't Catch That.${it.kind === "unknown" && it.suggestion && it.suggestion !== "Help" ? ` Did You Mean "${it.suggestion}"?` : ""} Try: "Trade For Me For 2h", "Long BTC 100 SL 2% TP 4%", "Close All", "Status" Or "Help".`);
    }
  };

  const [limitText, setLimitText] = useState("");
  const [limitOpen, setLimitOpen] = useState(false);
  const applyLimit = (raw?: string) => {
    const n = Math.round(Number(String(raw ?? limitText).replace(/[$,\s]/g, "")));
    if (!Number.isFinite(n) || n <= 0) return;
    setSt((x) => ({ ...x, maxLoss: n })); setLimitOpen(false); setStartMsg(null);
  };
  const limitHit = dailyPnl(st) <= -st.maxLoss;
  const limitEditor = () => canTrade ? (
    <form className="mt-1 flex w-full max-w-xs items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); applyLimit(); }}>
      <label className="sr-only" htmlFor="maxloss">Max Daily Loss</label>
      <input id="maxloss" inputMode="decimal" className="input h-8 min-w-0 flex-1 text-xs" placeholder={`New Limit, E.g. ${Math.max(st.maxLoss * 2, Math.ceil(-dailyPnl(st) + 100))}`} value={limitText} onChange={(e) => setLimitText(e.target.value)} />
      <button type="submit" className="btn-primary whitespace-nowrap px-3 py-1.5 text-[11px]">Save Limit</button>
    </form>
  ) : null;

  const resetPaper = () => {
    if (!canTrade) return;
    if (!window.confirm("Reset Paper Balance To $10,000? This Clears Positions, Orders And Fills.")) return;
    setSt((s) => ({ ...s, cash: START_EQUITY, positions: [], orders: [], fills: [], running: false, until: null, draft: null, lossResetAt: Date.now() }));
    setStartMsg(null);
    agentEvents.emit({ type: "paused" });
  };

  const uOf = (p: Position) => { const q = pxOf(pc(p)); return q != null ? upnl(p, q) : 0; };
  const totalU = st.positions.reduce((a, p) => a + uOf(p), 0);
  const agentFills = st.fills.filter((f) => f.by === "agent-auto");
  const wins = agentFills.filter((f) => f.pnl > 0).length;
  const realized = agentFills.reduce((a, f) => a + f.pnl, 0);
  const maxSz = Math.max(1e-9, ...book.bids.slice(0, 10).map((l) => l.sz), ...book.asks.slice(0, 10).map((l) => l.sz));

  const [cardFor, setCardFor] = useState<{ posId?: string; fill?: Fill } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardSnap = useMemo(() => {
    if (!cardFor) return null;
    const p = cardFor.posId ? st.positions.find((x) => x.id === cardFor.posId) : undefined;
    const f = cardFor.fill;
    if (!p && !f) return null;
    const side = (p ?? f)!.side, entry = (p ?? f)!.entry, size = (p ?? f)!.size, lev = clampLeverage((p ?? f)!.lev ?? 1);
    const exit = p ? (pxOf(pc(p)) ?? entry) : f!.exit;
    const liquidated = f ? f.reason === "Liquidated" : false;
    const { pnlPct, pnlUsd } = computePnl({ side, entry, exit, leverage: lev, size });
    const snap: PnlSnapshot = { agentName: name, tokenId: String(tokenId), market: `${pc((p ?? f)!)}-PERP`, side, leverage: lev, entry, exit, pnlPct, pnlUsd: f ? f.pnl : pnlUsd, liquidated, size };
    const tier = tierFromPnl(pnlPct, liquidated);
    const seed = [...(p ?? f)!.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { snap, tier, line: pickOneLiner(tier, seed) };
  }, [cardFor, st.positions, price, mids, name, tokenId, coin, pc]); // eslint-disable-line react-hooks/exhaustive-deps
  // An open position's card closes itself if the position goes away.
  useEffect(() => { if (cardFor?.posId && !st.positions.some((x) => x.id === cardFor.posId)) setCardFor(null); }, [cardFor, st.positions]);
  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a"); a.href = url; a.download = `bag-worker-${tokenId}-pnl.png`; a.click();
    } catch { say("Could Not Render The Card Image. Try Again."); }
  };

  return (
    <>
    <main className="mx-auto max-w-[1400px] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button className="btn-bracket mb-2 px-2 py-1" onClick={onBack}>← Back To Gallery</button>
          <p className="label-micro">Bag Worker #{tokenId} · Trade Desk</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream sm:text-3xl">{name} Trades {coin}-PERP</h1>
        </div>
        <div className="order-last w-full" role="group" aria-label="Market">
          <p className="label-micro mb-1">Market{coin !== cfg.market ? ` · Default ${cfg.market}` : ""}</p>
          <div className="terminal-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {PERPS.map((m) => {
              const open = st.positions.filter((p) => pc(p) === m).length;
              return (
                <button key={m} onClick={() => switchMarket(m)} aria-pressed={m === coin}
                  className={`chip shrink-0 whitespace-nowrap ${m === coin ? "border-brown-300 bg-brown-500 text-ink-950" : "hover:bg-brown-500/25"}`}>
                  {m}{open ? ` · ${open}` : ""}
                </button>);
            })}
          </div>
        </div>
        <div className="order-first w-full rounded-md border border-brown-400/30 bg-brown-500/10 px-3 py-2 sm:order-none sm:w-auto">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <p className="label-micro">Paper Equity</p>
              <p className="font-mono text-xl font-semibold text-cream sm:text-2xl">{usd(st.cash + totalU)}</p>
            </div>
            <div>
              <p className="label-micro">Cash</p>
              <p className="font-mono text-lg text-cream sm:text-xl">{usd(st.cash)}</p>
            </div>
            <div>
              <p className="label-micro">uPnL</p>
              <p className={`font-mono text-lg sm:text-xl ${totalU > 0 ? "text-green-400" : totalU < 0 ? "text-red-400" : "text-cream"}`}>{totalU > 0 ? "+" : ""}{usd(totalU)}</p>
            </div>
            {canTrade && (
              <button className="btn-bracket px-2 py-1 text-[11px]" onClick={resetPaper}>Reset Paper Balance</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip chip-live">{status === "Live" ? "● " : ""}{status} · Hyperliquid Mainnet Data</span>
          <span className="chip">Paper Trades Only · No Real Orders</span>
        </div>
      </div>
      <p className="mb-3 rounded-md border border-brown-400/20 bg-brown-500/10 px-3 py-2 text-[11px] leading-relaxed text-brown-200">
        Paper Trading Mode: Prices Are Live Hyperliquid Mainnet Market Data (Read Only). Every Order Here Is A Simulated Paper Trade Stored In This Browser For Your Wallet And Agent. Nothing Is Signed Or Sent To Hyperliquid.
      </p>
      {err && <p className="mb-3 text-xs text-red-300">{err}</p>}

      {!canTrade && (
        <div className="panel mb-3 flex flex-col gap-2 rounded-md p-3 sm:flex-row sm:items-center">
          <Lock size={16} className="text-brown-300" />
          <p className="text-xs text-cream-mute">Preview Mode: {accountId ? "Your Wallet Does Not Hold This Agent NFT." : "Connect A Wallet That Holds This Agent."} Orders And The Auto-Trader Unlock For The Holder Only.</p>
          {!accountId && <button className="btn-primary px-3 py-1.5 text-xs sm:ml-auto" onClick={onConnect}>Connect Wallet</button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className="panel rounded-md p-2 lg:col-span-8">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="font-mono text-xs text-brown-200">{coin}-PERP · 1m</span>
            <span className="font-mono text-lg text-cream">{price != null ? fmtPx(price) : "—"}</span>
          </div>
          <div ref={chartEl} className="h-[300px] w-full sm:h-[420px]" />
        </section>

        <aside className="space-y-3 lg:col-span-4">
          <div className="panel rounded-md p-3">
            <p className="label-micro mb-2">Order Ticket · Paper</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[10px] text-cream-mute">Leverage
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <input className="lev-range min-w-0 flex-1 accent-[#b98a5a]" style={{ minWidth: 0, width: "100%" }} type="range" min={1} max={MAX_LEVERAGE} step={1} value={st.lev} aria-label="Leverage"
                    onChange={(e) => setLev(e.target.value)} disabled={!canTrade} />
                  <input className="input shrink-0 text-right" style={{ width: "5rem", flex: "0 0 5rem" }} inputMode="numeric" value={levText} aria-label="Leverage Value"
                    onChange={(e) => { const t = e.target.value.replace(/[^\d]/g, "").slice(0, 4); if (!t) { setLevText(""); return; } setLev(t); }}
                    onBlur={() => setLev(levText || 1)} disabled={!canTrade} />
                  <span className="shrink-0 font-mono text-brown-200">x</span>
                </div>
                <span className="mt-1 block font-mono text-[9px] text-cream-mute">Max {MAX_LEVERAGE}x · Liquidation At {(100 / st.lev).toFixed(st.lev >= 100 ? 2 : 1)}% Adverse Move · Size × Entry = Margin</span>
              </label>
              <label className="text-[10px] text-cream-mute">Size ({coin})<input className="input mt-1" value={size} onChange={(e) => setSize(e.target.value)} disabled={!canTrade} /></label>
              <label className="text-[10px] text-cream-mute">Limit Price<input className="input mt-1" placeholder="Market" value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!canTrade} /></label>
              <label className="text-[10px] text-cream-mute">Take Profit<input className="input mt-1" placeholder="Optional" value={tp} onChange={(e) => setTp(e.target.value)} disabled={!canTrade} /></label>
              <label className="text-[10px] text-cream-mute">Stop Loss<input className="input mt-1" placeholder="Optional" value={sl} onChange={(e) => setSl(e.target.value)} disabled={!canTrade} /></label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn-primary py-2 text-xs" disabled={!canTrade} onClick={() => place("long", "market")}>Market Buy</button>
              <button className="btn-ghost py-2 text-xs" disabled={!canTrade} onClick={() => place("short", "market")}>Market Sell</button>
              <button className="btn-bracket py-1.5" disabled={!canTrade || !limit} onClick={() => place("long", "limit")}>Limit Buy</button>
              <button className="btn-bracket py-1.5" disabled={!canTrade || !limit} onClick={() => place("short", "limit")}>Limit Sell</button>
            </div>
          </div>

          <div className="panel rounded-md p-3">
            <div className="flex items-center justify-between">
              <p className="label-micro flex items-center gap-1"><Bot size={11} /> Agent Strategy · Paper · Runs Only On Your Command</p>
              <button className={`${st.running ? "btn-ghost" : "btn-primary"} px-3 py-1.5 text-xs`} disabled={!canTrade} onClick={toggleAgent}>
                {st.running ? <><Pause size={12} /> Pause Agent</> : <><Play size={12} /> Start Agent</>}
              </button>
            </div>
            <AgentAvatar image={withBase(`/agents-desk/${tokenId}.jpg`)} name={name} running={st.running && canTrade} />
            <p className="mt-2 font-display text-sm text-brown-100">{cfg.strategy.label}</p>
            {st.running && <p className="font-mono text-[10px] text-green-400">Running{st.until ? ` Until ${hhmm(st.until)}` : ""}</p>}
            {st.running && canTrade && <p className="rounded border border-brown-400/20 bg-ink-950/60 px-2 py-1 text-center font-mono text-[10px] leading-snug text-brown-200" aria-live="polite">{st.lastNote ?? "Watching, No Setup Yet"}{st.until ? ` · Ends ${hhmm(st.until)}` : ""} · Last Check {st.lastCheckAt ? hhmm(st.lastCheckAt) : "Starting"}</p>}
            <p className="font-mono text-[10px] text-cream-mute">Leverage {st.lev}x · Guardrails · Max Size {usd(st.maxSize)} · Max Daily Loss {usd(st.maxLoss)} · Today {usd(dailyPnl(st))}</p>
            {canTrade && <div className="mt-1 flex flex-col items-start gap-1"><button className="btn-bracket px-2 py-1 text-[11px]" onClick={() => setLimitOpen((o) => !o)}>{limitOpen ? "Close" : "Edit Daily Loss Limit"}</button>{limitOpen && limitEditor()}</div>}
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
              {strategyParams(cfg.strategy).flatMap(([k, v]) => [<dt key={k} className="text-cream-mute">{k}</dt>, <dd key={k + "v"} className="text-right text-brown-200">{v}</dd>])}
              <dt className="text-cream-mute">Market</dt><dd className="text-right text-brown-200">{coin}-PERP</dd>
            </dl>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="panel-tight rounded p-1.5"><p className="text-[9px] text-cream-mute">Win Rate</p><p className="font-mono text-xs text-cream">{agentFills.length ? `${Math.round((wins / agentFills.length) * 100)}%` : "—"}</p></div>
              <div className="panel-tight rounded p-1.5"><p className="text-[9px] text-cream-mute">Trades</p><p className="font-mono text-xs text-cream">{agentFills.length}</p></div>
              <div className="panel-tight rounded p-1.5"><p className="text-[9px] text-cream-mute">Realized PnL</p><p className={`font-mono text-xs ${realized >= 0 ? "text-green-400" : "text-red-400"}`}>{usd(realized)}</p></div>
            </div>
          </div>
        </aside>

        {st.running ? (
        <section className="panel flex flex-col rounded-md p-3 lg:col-span-12">
          <p className="label-micro mb-2 flex items-center gap-1"><MessageSquare size={11} /> Chat With {name} · Paper Trades Only</p>
          <div className="terminal-scroll h-56 space-y-1.5 overflow-y-auto rounded border border-brown-400/10 bg-ink-950/60 p-2 text-xs">
            {!st.chat.length && <p className="text-cream-mute">Tell Me What To Do Or Just Ask Me Something. I Never Trade On My Own, Only When You Say So. Try &quot;What Setup Are You Looking For?&quot; Or &quot;Trade For Me For 2h&quot;.</p>}
            {st.chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] rounded-lg px-2.5 py-1.5 leading-relaxed ${m.role === "you" ? "bg-brown-500 text-ink-950" : "border border-brown-400/20 bg-ink-800 text-cream-dim"}`}>
                  {m.text}<span className="ml-2 font-mono text-[9px] opacity-60">{tstr(m.time)}</span>
                </p>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="label-micro w-full">Ask Me Anything</span>
            {ASK_CHIPS(coin).map((c) => (<button key={c} className="chip border-brown-300/40 hover:bg-brown-500/25" onClick={() => handle(c)}>{c}</button>))}
            {CHAT_EXAMPLES.map((c) => (<button key={c} className="chip hover:bg-brown-500/25" onClick={() => handle(c)}>{c}</button>))}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); handle(input); }}>
            <input className="input" placeholder={canTrade ? "Tell Your Agent What To Do…" : "Holder Only · Preview Mode"} value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn-primary px-3" type="submit" aria-label="Send"><Send size={14} /></button>
          </form>
        </section>
        ) : (
        <section className="panel flex flex-col items-center gap-2 rounded-md p-4 text-center lg:col-span-12" aria-label="Chat Locked">
          <p className="label-micro flex items-center gap-1"><MessageSquare size={11} /> Chat With {name}</p>
          <p className="text-sm text-cream">Start Your Agent To Open The Chat</p>
          <p className="text-[11px] text-cream-mute">{canTrade ? "Your Chat History Is Saved And Comes Back When The Agent Runs." : "Holder Only · Preview Mode"}</p>
          <button className="btn-primary px-4 py-1.5 text-xs" disabled={!canTrade} onClick={toggleAgent}><Play size={12} /> Start Agent</button>
          {(startMsg || (limitHit && canTrade)) && (<div className="flex w-full flex-col items-center gap-1.5"><p className="text-[11px] text-red-400">{startMsg ?? `Daily Loss Limit Of ${usd(st.maxLoss)} Is Hit. Raise It To Start Again.`}</p><div className="flex flex-wrap justify-center gap-1.5"><button className="btn-primary px-3 py-1.5 text-[11px]" onClick={() => applyLimit(String(Math.max(st.maxLoss * 2, Math.ceil(-dailyPnl(st) + 100))))}>Raise Limit To {usd(Math.max(st.maxLoss * 2, Math.ceil(-dailyPnl(st) + 100)))}</button><button className="btn-bracket px-3 py-1.5 text-[11px]" onClick={resetPaper}>Reset Paper Balance</button></div>{limitEditor()}</div>)}
        </section>
        )}

        <section className="panel rounded-md p-3 lg:col-span-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="label-micro">Positions · Paper</p>
            <p className="font-mono text-[10px] text-cream-mute">Equity {usd(st.cash + totalU)} · uPnL <span className={totalU >= 0 ? "text-green-400" : "text-red-400"}>{usd(totalU)}</span></p>
          </div>
          {/* Mobile: stacked cards */}
          <div className="space-y-2 sm:hidden">
            {st.positions.map((p) => { const u = uOf(p); const q = pxOf(pc(p)); return (
              <div key={p.id} className="rounded border border-brown-400/15 bg-ink-950/50 p-2 font-mono text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span><span className="text-cream">{pc(p)}</span> <span className={p.side === "long" ? "text-green-400" : "text-red-400"}>{p.side === "long" ? "Long" : "Short"}</span> <span className="text-cream-mute">· {p.lev ?? 1}x · {ownerLabel(p.by)}</span></span>
                  <span className={u >= 0 ? "text-green-400" : "text-red-400"}>{usd(u)}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-x-2 text-[10px] text-cream-mute">
                  <span>Size {p.size}</span><span>Entry {fmtPx(p.entry)}</span><span className="text-red-300/80">Liq {fmtPx(liqPx(p))}</span>
                  <span>TP {p.tp ? fmtPx(p.tp) : "None"}</span><span>SL {p.sl ? fmtPx(p.sl) : "None"}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-bracket flex-1 px-2 py-1" disabled={q == null} onClick={() => setCardFor({ posId: p.id })}>PnL Card</button>
                  <button className="btn-bracket flex-1 px-2 py-1" disabled={!canTrade || q == null} onClick={() => q != null && closePos(p, q, "Closed By Owner")}>Close</button>
                </div>
              </div>); })}
            {st.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded border border-brown-400/15 p-2 font-mono text-[11px] text-cream-mute">
                <span>{pc(o)} Limit {o.side === "long" ? "Buy" : "Sell"} {o.size} @ {fmtPx(o.limit)} · Pending</span>
                <button className="btn-bracket px-2 py-0.5" disabled={!canTrade} onClick={() => setSt((s) => ({ ...s, orders: s.orders.filter((x) => x.id !== o.id) }))}>Cancel</button>
              </div>))}
            {!st.positions.length && !st.orders.length && <p className="py-3 text-center font-mono text-[11px] text-cream-mute">No Open Positions. The Desk Is Suspiciously Calm.</p>}
          </div>
          {/* Desktop: table, scrolls inside the panel if tight */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] font-mono text-[11px]">
              <thead className="text-left text-cream-mute"><tr><th>Market</th><th>By</th><th>Side</th><th>Size</th><th>Lev</th><th>Entry</th><th>Liq</th><th>TP</th><th>SL</th><th>uPnL</th><th /></tr></thead>
              <tbody>
                {st.positions.map((p) => { const u = uOf(p); const q = pxOf(pc(p)); return (
                  <tr key={p.id} className="border-t border-brown-400/10">
                    <td className="py-1 text-cream">{pc(p)}</td><td className="text-brown-300">{ownerLabel(p.by)}</td>
                    <td className={p.side === "long" ? "text-green-400" : "text-red-400"}>{p.side === "long" ? "Long" : "Short"}</td>
                    <td>{p.size}</td><td>{p.lev ?? 1}x</td><td>{fmtPx(p.entry)}</td><td className="text-red-300/80">{fmtPx(liqPx(p))}</td><td>{p.tp ? fmtPx(p.tp) : "None"}</td><td>{p.sl ? fmtPx(p.sl) : "None"}</td>
                    <td className={u >= 0 ? "text-green-400" : "text-red-400"}>{usd(u)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-bracket mr-1 px-2 py-0.5" disabled={q == null} onClick={() => setCardFor({ posId: p.id })}>PnL Card</button>
                      <button className="btn-bracket px-2 py-0.5" disabled={!canTrade || q == null} onClick={() => q != null && closePos(p, q, "Closed By Owner")}>Close</button>
                    </td>
                  </tr>); })}
                {st.orders.map((o) => (
                  <tr key={o.id} className="border-t border-brown-400/10 text-cream-mute">
                    <td className="py-1 text-cream">{pc(o)}</td><td>You</td><td>Limit {o.side === "long" ? "Buy" : "Sell"}</td><td>{o.size}</td><td>{o.lev ?? st.lev}x</td><td>{fmtPx(o.limit)}</td><td>None</td><td>{o.tp ? fmtPx(o.tp) : "None"}</td><td>{o.sl ? fmtPx(o.sl) : "None"}</td><td>Pending</td>
                    <td className="text-right"><button className="btn-bracket px-2 py-0.5" disabled={!canTrade} onClick={() => setSt((s) => ({ ...s, orders: s.orders.filter((x) => x.id !== o.id) }))}>Cancel</button></td>
                  </tr>))}
                {!st.positions.length && !st.orders.length && <tr><td colSpan={11} className="py-3 text-center text-cream-mute">No Open Positions. The Desk Is Suspiciously Calm.</td></tr>}
              </tbody>
            </table>
          </div>
          {st.fills.length > 0 && (<>
            <p className="label-micro mb-1 mt-4">Closed Trades</p>
            <div className="terminal-scroll max-h-56 space-y-1 overflow-y-auto font-mono text-[10px]">
              {st.fills.slice(0, 30).map((f) => (
                <div key={f.id + "-" + f.closedAt} className="flex items-center justify-between gap-2 border-t border-brown-400/10 pt-1">
                  <span className="min-w-0 truncate">
                    <span className={f.side === "long" ? "text-green-400" : "text-red-400"}>{f.side === "long" ? "Long" : "Short"}</span>
                    <span className="text-cream"> {pc(f)}</span><span className="text-cream-mute"> {fmtPx(f.entry)} → {exitLabel(f)} @ {fmtPx(f.exit)} · {ownerLabel(f.by)} · {tstr(f.closedAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={f.pnl >= 0 ? "text-green-400" : "text-red-400"}>{f.pnl >= 0 ? "+" : ""}{usd(f.pnl)}</span>
                    <button className="btn-bracket px-2 py-0.5" onClick={() => setCardFor({ fill: f })}>PnL Card</button>
                  </span>
                </div>))}
            </div>
          </>)}
          <p className="label-micro mb-1 mt-4">Agent Decision Log</p>
          <div className="terminal-scroll max-h-48 overflow-y-auto rounded border border-brown-400/10 bg-ink-950/60 p-2 font-mono text-[10px] leading-relaxed">
            {st.log.length ? st.log.map((d, i) => (<p key={i}><span className="text-brown-400">{tstr(d.time)}</span> <span className="text-cream-dim">{d.text}</span></p>)) : <p className="text-cream-mute">No Decisions Yet. Tell The Agent &quot;Trade For Me&quot; And It Will Narrate Every Move.</p>}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
          <div className="panel rounded-md p-3">
            <p className="label-micro mb-1">Order Book</p>
            <div className="font-mono text-[10px]">
              {book.asks.slice(0, 8).reverse().map((l, i) => (
                <div key={"a" + i} className="relative flex justify-between px-1"><span className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${(l.sz / maxSz) * 100}%` }} /><span className="relative text-red-400">{fmtPx(l.px)}</span><span className="relative text-cream-mute">{l.sz}</span></div>))}
              <div className="my-1 border-y border-brown-400/15 py-0.5 text-center text-cream">{price != null ? fmtPx(price) : "—"}</div>
              {book.bids.slice(0, 8).map((l, i) => (
                <div key={"b" + i} className="relative flex justify-between px-1"><span className="absolute inset-y-0 right-0 bg-green-500/10" style={{ width: `${(l.sz / maxSz) * 100}%` }} /><span className="relative text-green-400">{fmtPx(l.px)}</span><span className="relative text-cream-mute">{l.sz}</span></div>))}
            </div>
          </div>
          <div className="panel rounded-md p-3">
            <p className="label-micro mb-1">Recent Trades</p>
            <div className="terminal-scroll max-h-56 overflow-y-auto font-mono text-[10px]">
              {trades.map((t, i) => (<div key={t.tid + "-" + t.time + "-" + i} className="flex justify-between"><span className={t.side === "B" ? "text-green-400" : "text-red-400"}>{fmtPx(t.px)}</span><span className="text-cream-mute">{t.sz}</span><span className="text-cream-mute/70">{tstr(t.time)}</span></div>))}
              {!trades.length && <p className="text-cream-mute">Waiting On Tape…</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
      {cardSnap && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/85 p-3 backdrop-blur-sm" role="dialog" aria-label="PnL Card" onClick={() => setCardFor(null)}>
          <div className="w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-micro">{cardFor?.posId ? "Live PnL Card · Open Position" : "PnL Card · Closed Trade"}</p>
              <button className="btn-bracket px-2 py-0.5" aria-label="Close PnL Card" onClick={() => setCardFor(null)}><X size={12} /></button>
            </div>
            <PnlCard ref={cardRef} snapshot={cardSnap.snap} tier={cardSnap.tier} oneLiner={cardSnap.line} />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary flex-1" onClick={downloadCard}><Download size={14} /> Download PNG</button>
              <button className="btn-bracket flex-1" onClick={() => window.open(xIntentUrl(buildShareText(cardSnap.snap, cardSnap.tier, cardSnap.line)), "_blank", "noopener,noreferrer")}><Share2 size={14} /> Share On X</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
