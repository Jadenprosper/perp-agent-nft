/** Conversational layer for the Trade chat: template + live data, no LLM, no invented numbers. */
import type { Candle } from "@/lib/hl";
import type { StrategyConfig } from "@/lib/agentConfig";
import { atr, ema, rsi, type Fill, type Position } from "@/lib/strategy";

export type TalkCtx = {
  name: string; coin: string; strategy: StrategyConfig; closed: Candle[]; price: number | null;
  running: boolean; until: number | null; lastNote?: string; lastCheckAt?: number;
  positions: Position[]; fills: Fill[]; cash: number; lev: number; maxSize: number; maxLoss: number; today: number;
  lastTopic?: string; seed?: number; priceOf?: (coin: string) => number | null; defaultCoin?: string;
};
export type TalkReply = { text: string; topic: string };

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const px = (n: number) => (n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(n >= 10 ? 2 : 4)}` : `$${n.toPrecision(4)}`);
const pct = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
let rot = 0;
const pick = <T,>(a: T[], seed?: number) => a[(seed ?? rot++) % a.length];

/** Live market read from closed 1m candles. Null when there is not enough data. */
export function marketRead(c: TalkCtx) {
  const cs = c.closed; if (cs.length < 60) return null;
  const closes = cs.map((x) => x.close);
  const last = c.price ?? closes[closes.length - 1];
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const n = closes.length - 1;
  const trend = e20[n] > e50[n] * 1.0005 ? "up" : e20[n] < e50[n] * 0.9995 ? "down" : "flat";
  const a = atr(cs, 14); const atrPct = (a / last) * 100;
  const ch = (bars: number) => (closes.length > bars ? ((last - closes[n - bars]) / closes[n - bars]) * 100 : null);
  const hi = Math.max(...cs.slice(-60).map((x) => x.high)), lo = Math.min(...cs.slice(-60).map((x) => x.low));
  const vol = atrPct > 0.15 ? "jumpy" : atrPct > 0.06 ? "normal" : "quiet";
  return { last, trend, atr: a, atrPct, ch15: ch(15), ch60: ch(60), hi, lo, vol, rsi14: rsi(closes, 14) };
}

/** Where the strategy trigger is versus price right now. */
export function setupRead(c: TalkCtx) {
  const s = c.strategy, cs = c.closed; const closes = cs.map((x) => x.close);
  const last = c.price ?? closes[closes.length - 1];
  if (!cs.length || last == null) return { text: "I don't have enough candles yet to read the setup. Give the feed a minute.", ready: false };
  if (s.kind === "meanrev") {
    if (closes.length < Math.max(s.bbPeriod, s.rsiPeriod) + 2) return { text: "Still loading candles for the Bollinger and RSI read.", ready: false };
    const w = closes.slice(-s.bbPeriod); const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
    const up = mean + s.bbStd * sd, lo = mean - s.bbStd * sd; const r = rsi(closes, s.rsiPeriod);
    const dLo = ((last - lo) / last) * 100, dUp = ((up - last) / last) * 100;
    const longOk = r < s.oversold && last < lo, shortOk = r > s.overbought && last > up;
    const near = dLo < dUp ? `the lower band is ${dLo.toFixed(2)}% below` : `the upper band is ${dUp.toFixed(2)}% above`;
    return {
      ready: longOk || shortOk,
      text: `I'm a mean reversion bot. I long when RSI ${s.rsiPeriod} drops under ${s.oversold} AND price closes below the lower Bollinger band (${px(lo)}). I short when RSI goes over ${s.overbought} AND price closes above the upper band (${px(up)}). Right now ${c.coin} is ${px(last)} with RSI ${r.toFixed(1)}, and ${near}. ${longOk ? "That's a long setup, I'll act on the candle close." : shortOk ? "That's a short setup, I'll act on the candle close." : r < s.oversold + 10 ? "RSI is getting low, so a long could be close." : r > s.overbought - 10 ? "RSI is getting hot, so a short could be close." : "So not yet, we're in the boring middle."}`,
      parts: { r, up, lo, mean },
    };
  }
  if (s.kind === "breakout") {
    if (cs.length < s.lookback + 2) return { text: "Still loading candles for the breakout range.", ready: false };
    const win = cs.slice(-s.lookback - 1, -1); const hi = Math.max(...win.map((x) => x.high)), lo = Math.min(...win.map((x) => x.low));
    const dHi = ((hi - last) / last) * 100, dLo = ((last - lo) / last) * 100;
    return {
      ready: last > hi || last < lo,
      text: `I'm a breakout bot. I long when a candle closes above the ${s.lookback}-bar high (${px(hi)}) and short when one closes below the ${s.lookback}-bar low (${px(lo)}). ${c.coin} is at ${px(last)}, ${dHi.toFixed(2)}% under the high and ${dLo.toFixed(2)}% over the low. ${last > hi ? "It's poking above the high right now." : last < lo ? "It's breaking the low right now." : dHi < dLo ? "Closer to the upside trigger." : "Closer to the downside trigger."}`,
    };
  }
  if (closes.length < s.slow + 2) return { text: "Still loading candles for the EMA read.", ready: false };
  const f = ema(closes, s.fast), sl = ema(closes, s.slow); const n = closes.length - 1;
  const gap = ((f[n] - sl[n]) / sl[n]) * 100;
  return {
    ready: false,
    text: `I'm a trend follower. I long when EMA ${s.fast} crosses above EMA ${s.slow} and short when it crosses below. Right now EMA ${s.fast} is ${px(f[n])} and EMA ${s.slow} is ${px(sl[n])}, a ${pct(gap, 3)} gap, so the fast line is ${gap >= 0 ? "above" : "below"}. ${Math.abs(gap) < 0.03 ? "They're basically touching, a cross could come any minute." : `I need a cross ${gap >= 0 ? "down for a short" : "up for a long"}, or a fresh cross back.`} ${c.coin} is at ${px(last)}.`,
  };
}

const T = (re: RegExp, q: string) => re.test(q);
const COIN_WORDS: Record<string, string> = { btc: "BTC", bitcoin: "BTC", eth: "ETH", ether: "ETH", ethereum: "ETH", sol: "SOL", solana: "SOL", hype: "HYPE", hyperliquid: "HYPE",
  xrp: "XRP", ripple: "XRP", doge: "DOGE", dogecoin: "DOGE", sui: "SUI", avax: "AVAX", avalanche: "AVAX", link: "LINK", chainlink: "LINK", bnb: "BNB", near: "NEAR", aave: "AAVE" };
/** First coin named in a message, if any. */
export function coinMentioned(raw: string): string | null {
  for (const w of raw.split(/[^A-Za-z]+/)) { const l = w.toLowerCase(); if ((l === "near" || l === "link") && w !== w.toUpperCase()) continue; if (COIN_WORDS[l]) return COIN_WORDS[l]; }
  return null;
}

export function converse(raw: string, c: TalkCtx): TalkReply | null {
  const q = ` ${raw.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9%$.?\s/]/g, " ").replace(/\s+/g, " ").trim()} `;
  const m = marketRead(c);
  const mine = c.positions.find((p) => p.by === "agent-auto");
  const sess = c.running ? `I'm on shift${c.until ? ` until ${hhmm(c.until)}` : " until you say pause"}` : "I'm paused right now";
  const agentFills = c.fills.filter((f) => f.by === "agent-auto");
  const wins = agentFills.filter((f) => f.pnl > 0).length;
  const mood = () => (m ? `${c.coin} is ${px(m.last)}, ${m.ch60 != null ? `${pct(m.ch60)} over the last hour` : "no hourly change yet"}, trend ${m.trend}, volatility ${m.vol} (ATR ${m.atrPct.toFixed(3)}% per minute).` : `I don't have enough candles yet for a read on ${c.coin}.`);
  const disc = " Paper trading only, not financial advice.";
  const say = (text: string, topic: string): TalkReply => ({ text, topic });

  // follow ups that lean on the last topic
  if (T(/^ (and |so )?(why( not)?|how come|really|explain( that)?|what does that mean|meaning)\s?\?? $/, q) && c.lastTopic) {
    if (c.lastTopic === "setup") return say(`Because both conditions have to line up on a closed candle. ${setupRead(c).text}`, "setup");
    if (c.lastTopic === "skip") return say(c.lastNote ? `Last thing I noted: ${c.lastNote}. The guardrails are Max Size ${usd(c.maxSize)} and Max Daily Loss ${usd(c.maxLoss)}.` : "I haven't skipped anything this session.", "skip");
    if (c.lastTopic === "opinion") return say(`My view is just the numbers. ${m ? mood() : ""} ${setupRead(c).text}`, "opinion");
  }
  const CANON: Record<string, string> = { setup: "what setup are you looking for", market: "how is the market looking", opinion: "should i long now", positions: "what positions do i have", session: "are you running", pnl: "how much money have i made", stats: "win rate", skip: "why no trades" };
  if (T(/^ (and |so |ok |okay )?(now|and now|what about now|how about now|still|any change|anything yet|yet|update|again|same question|and)\s?\?? $/, q) && c.lastTopic && CANON[c.lastTopic])
    return converse(CANON[c.lastTopic], { ...c, lastTopic: undefined });

  if (T(/\b(setup|set up|looking for|waiting for|what are you (watching|hunting|waiting)|trigger|entry (signal|point|condition)|when (will|do) you (buy|sell|trade|enter|long|short)|your (strategy|plan|edge|rules)|how do you trade|what.?s the plan|signal)\b/, q))
    return say(`${pick(["Here's what I'm hunting.", "Glad you asked.", "The plan, in plain words.", "Okay, setup check."], c.seed)} ${setupRead(c).text}`, "setup");
  if (T(/\b(why (no|not|havent|hasnt|didnt|arent|dont)|no trades|nothing happening|not trading|doing nothing|any trades|skip|skipped|so quiet|still waiting|havent traded|you traded)\b/, q)) {
    const sr = setupRead(c);
    return say(`${c.lastNote && /skip/i.test(c.lastNote) ? `I did skip one: ${c.lastNote}. ` : ""}${c.running ? "" : "First thing, I'm paused, so I'm not taking trades. "}${agentFills.length ? `I've made ${agentFills.length} trade${agentFills.length === 1 ? "" : "s"} so far. ` : "No strategy trades yet. "}My rules are strict on purpose. ${sr.text}`, "skip");
  }
  if (T(/^ (hi|hey|hello|yo|sup|gm|good (morning|afternoon|evening)|hiya|howdy|whats up|wassup|what up)\b/, q))
    return say(pick([`Hey! ${sess}. ${mood()} Ask me what setup I'm hunting or how ${c.coin} looks.`, `Yo. ${c.name} here, clocked in on ${c.coin}. ${mood()}`, `GM. ${sess}. Want the setup, the market read, or our PnL?`], c.seed), "greet");
  if (T(/\b(thanks|thank you|thx|ty|appreciate|cheers)\b/, q)) return say(pick(["Anytime. I'll keep watching the candles.", "No problem, that's what I'm paid for. In paper.", "You got it."], c.seed), "smalltalk");
  if (T(/\b(how are you|how r u|hows it going|how you doing|you good|you ok)\b/, q)) return say(`${pick(["Doing great, staring at candles like always.", "Living the dream, one minute candle at a time.", "Good. Caffeinated. Bag on."], c.seed)} ${sess}.`, "smalltalk");
  if (T(/\b(who are you|your name|what are you\s?\??\s?$|tell me about yourself|what do you do)\b/, q)) return say(`I'm ${c.name}, your Bag Worker on ${c.coin}-PERP. I run ${c.strategy.label} on 1 minute candles, paper only, and only trade when you start me. ${sess}.`, "about");
  if (T(/\b(lol|lmao|haha|nice|cool|wow|damn|bruh|ok cool)\b/, q) && q.length < 20) return say(pick(["Right?", "Ha. Back to the charts.", "Stay frosty."], c.seed), "smalltalk");
  if (T(/\b(joke|funny)\b/, q)) return say(pick(["Why did the trader bring a ladder? To reach the stop loss he set way too high.", "I'm literally a paper bag. My risk tolerance is soggy.", "Buy high, sell low. Wait, other way around."], c.seed), "smalltalk");

  // explainers
  if (T(/\b(what is|whats|explain|what does|meaning of|define|how does)\b.*\brsi\b|\brsi\b.*\b(mean|work)/, q)) return say(`RSI is a 0 to 100 gauge of recent up moves versus down moves. Under 30 usually means oversold, over 70 overbought. I use RSI ${c.strategy.kind === "meanrev" ? c.strategy.rsiPeriod : 14}.${m ? ` ${c.coin} RSI 14 is ${m.rsi14.toFixed(1)} right now.` : ""}`, "explain");
  if (T(/\b(bollinger|bands?)\b/, q) && T(/\b(what\w*|explain|how|mean\w*)\b/, q)) return say("Bollinger bands are a moving average with a band a few standard deviations above and below. Price outside the band is stretched, which mean reversion bots like to fade.", "explain");
  if (T(/\batr\b|average true range/, q)) return say(`ATR is the average size of a candle's range, so it measures volatility. I size stops and targets off it.${m ? ` ${c.coin} ATR 14 is ${px(m.atr)}, about ${m.atrPct.toFixed(3)}% per minute.` : ""}`, "explain");
  if (T(/\b(ema|moving average)\b/, q) && T(/\b(what\w*|explain|how|mean\w*)\b/, q)) return say("An EMA is a moving average that weights recent prices more. A fast EMA crossing a slow one is a classic trend signal.", "explain");
  if (T(/\b(donchian|breakout)\b/, q) && T(/\b(what\w*|explain|how|mean\w*)\b/, q)) return say("A Donchian breakout watches the highest high and lowest low of the last N candles. A close outside that range is the signal.", "explain");
  if (T(/\bliquidat/, q)) {
    const p = c.positions[0];
    return say(`Liquidation is when your loss eats all the margin on a position. At ${c.lev}x that's about a ${(100 / c.lev).toFixed(c.lev >= 100 ? 2 : 1)}% move against you.${p ? ` Your ${p.side} from ${px(p.entry)} liquidates near ${px(p.entry * (p.side === "long" ? 1 - 1 / (p.lev ?? 1) : 1 + 1 / (p.lev ?? 1)))}.` : ""}`, "explain");
  }
  if (T(/\b(what is|whats|explain|how does)\b.*\bleverage\b|\bleverage\b.*\b(mean|work)\b|\bwhat leverage\b|\bmy leverage\b/, q)) return say(`Leverage multiplies your PnL on the margin you post. You're at ${c.lev}x, so a 1% move is about ${c.lev}% on margin, and liquidation is roughly a ${(100 / c.lev).toFixed(c.lev >= 100 ? 2 : 1)}% move away. Say "Set Leverage 10x" to change it.`, "explain");
  if (T(/\b(stop loss|take profit|\bsl\b|\btp\b)\b/, q) && T(/\b(what|explain|how|why|mean)\b/, q)) return say(`My exits come from ATR: stop ${c.strategy.slAtr}x ATR and target ${c.strategy.tpAtr}x ATR from entry.${m ? ` With ATR at ${px(m.atr)} that's a stop about ${px(m.atr * c.strategy.slAtr)} away and a target about ${px(m.atr * c.strategy.tpAtr)} away.` : ""}`, "explain");
  if (T(/\b(paper|real money|is this real|fake money)\b/, q)) return say("All paper. No real money moves, prices are live from Hyperliquid but fills are simulated in your browser.", "about");

  // strategy / setup
  if (T(/\b(why (no|not|havent|didnt|arent)|no trades|nothing happening|not trading|doing nothing|any trades|skip|skipped|so quiet|still waiting)\b/, q)) {
    const sr = setupRead(c);
    return say(`${c.lastNote && /skip/i.test(c.lastNote) ? `I did skip one: ${c.lastNote}. ` : ""}${c.running ? "" : "First thing, I'm paused, so I'm not taking trades. "}${agentFills.length ? `I've made ${agentFills.length} trade${agentFills.length === 1 ? "" : "s"} so far. ` : ""}${sr.text}`, "skip");
  }

  // opinion
  if (T(/\b(should i|would you|do you think|is it (a )?good|good time|buy now|long now|short now|go long|go short|ape|worth it|bullish|bearish|your (view|take|opinion)|what would you do|prediction|where.*going)\b/, q)) {
    if (!m) return say(`Not enough data for a view yet.${disc}`, "opinion");
    const sr = setupRead(c);
    const lean = m.trend === "up" ? "the short term trend is up" : m.trend === "down" ? "the short term trend is down" : "there's no clear short term trend";
    const wantShort = /\b(short|sell|bearish|down)\b/.test(q) && !/\b(long|buy|bullish|up)\b/.test(q);
    const wantLong = /\b(long|buy|bullish|up)\b/.test(q) && !/\b(short|sell|bearish|down)\b/.test(q);
    const fit = wantLong ? (m.trend === "up" ? "A long goes with the short term trend." : m.trend === "down" ? "A long fights the short term trend." : "A long has no trend behind it.")
      : wantShort ? (m.trend === "down" ? "A short goes with the short term trend." : m.trend === "up" ? "A short fights the short term trend." : "A short has no trend behind it.") : "";
    const verdict = `${fit} ${sr.ready ? "My strategy actually has a setup right now." : "My own strategy doesn't have a setup yet, so I'd be waiting."}`.trim();
    return say(`Honest read on ${c.coin}: ${lean}, ${m.ch60 != null ? `${pct(m.ch60)} in the last hour,` : ""} volatility is ${m.vol}, RSI 14 ${m.rsi14.toFixed(1)}. ${verdict}${m.rsi14 > 70 ? " RSI is hot, chasing a long here is risky." : m.rsi14 < 30 ? " RSI is washed out, shorting here is risky." : ""} If you do trade, size small and set a stop.${disc}`, "opinion");
  }

  // market
  const coinAsked = q.match(/\b(btc|bitcoin|eth|ether|ethereum|sol|solana|hype|xrp|doge|sui|avax|link|bnb|near|aave)\b/);
  if (T(/\b(how.?s|how is|hows|looking|market|price|chart|trend|vol|volatil\w*|moving|pumping|dumping|up or down|direction|what.?s .* (at|doing))\b/, q) || (coinAsked && T(/\?/, q))) {
    if (!m) return say(mood(), "market");
    const range = `Last hour range ${px(m.lo)} to ${px(m.hi)}.`;
    const vibe = m.trend === "up" ? pick(["Bulls have the wheel for now.", "Grinding higher."], c.seed) : m.trend === "down" ? pick(["Sellers are leaning on it.", "Drifting lower."], c.seed) : pick(["Chopping sideways.", "Going nowhere fast."], c.seed);
    return say(`${mood()} ${range} ${vibe}`, "market");
  }

  // pnl / positions / session
  if (T(/\b(win rate|winrate|record|track record|how many trades|how.?ve you done|hit rate|stats)\b/, q))
    return say(agentFills.length ? `My strategy trades: ${agentFills.length}, wins ${wins}, win rate ${Math.round((wins / agentFills.length) * 100)}%, realized ${usd(agentFills.reduce((a, f) => a + f.pnl, 0))}.` : "No strategy trades yet, so no win rate. Start me and give it some time.", "stats");
  if (T(/\b(position|positions|open trades|whats open|exposure|risk|in a trade|holding|my trade)\b/, q)) {
    if (!c.positions.length) return say(`Nothing open. ${sess}.`, "positions");
    const lines = c.positions.map((p) => {
      const pcn = p.coin ?? c.defaultCoin ?? c.coin; const lp = pcn === c.coin ? c.price : c.priceOf?.(pcn) ?? null;
      const u = lp != null ? Math.max(-p.entry * p.size, (p.side === "long" ? lp - p.entry : p.entry - lp) * p.size * (p.lev ?? 1)) : 0;
      return `${pcn} ${p.side} ${p.size} @ ${px(p.entry)} ${p.lev ?? 1}x (${p.by === "agent-auto" ? "mine" : "yours"}), uPnL ${usd(u)}, SL ${p.sl != null ? px(p.sl) : "none"}, TP ${p.tp != null ? px(p.tp) : "none"}`;
    });
    return say(`Open: ${lines.join(" | ")}.${c.positions.some((p) => p.sl == null) ? " One has no stop loss, that's risky at this leverage." : ""}`, "positions");
  }
  if (T(/\b(session|how long|when do you stop|ends?|time left|still running|are you (on|running|working|awake|alive)|you there)\b/, q)) {
    const left = c.until ? Math.max(0, Math.round((c.until - Date.now()) / 60000)) : null;
    return say(`${sess}${left != null && c.running ? `, about ${left} min left` : ""}.${c.lastCheckAt ? ` Last check ${hhmm(c.lastCheckAt)}: ${c.lastNote ?? "watching"}.` : ""}${mine ? ` I'm in a ${mine.side} from ${px(mine.entry)}.` : ""}`, "session");
  }
  if (T(/\b(pnl|profit|money|up or down|am i up|am i down|balance|equity|made|lost|losing|winning)\b/, q))
    return say(`Cash ${usd(c.cash)}, today ${usd(c.today)}, all time realized ${usd(c.fills.reduce((a, f) => a + f.pnl, 0))}. Daily loss limit ${usd(c.maxLoss)}.`, "pnl");

  if (T(/\?\s*$/, q) || T(/^ (what|why|how|when|where|who|is|are|do|does|can|could|should|will|would)\b/, q))
    return say(`Not sure I follow, but here's where things stand. ${mood()} ${sess}. You can ask me "What Setup Are You Looking For?", "How's ${c.coin} Looking?", "Should I Long Now?" or "Why No Trades?".`, "fallback");
  return null;
}

export const ASK_CHIPS = (coin: string) => ["What Setup Are You Looking For?", `How's ${coin} Looking?`, "Should I Long Now?", "Why No Trades Yet?", "What's My Risk?", "Explain RSI"];
