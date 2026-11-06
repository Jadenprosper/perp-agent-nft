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
const disc = " Paper trading only, not financial advice.";
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
  const win60 = cs.slice(-60);
  const hi = Math.max(...win60.map((x) => x.high)), lo = Math.min(...win60.map((x) => x.low));
  const hi4 = Math.max(...cs.slice(-240).map((x) => x.high)), lo4 = Math.min(...cs.slice(-240).map((x) => x.low));
  const vol = atrPct > 0.15 ? "jumpy" : atrPct > 0.06 ? "normal" : "quiet";
  const r14 = rsi(closes, 14);
  let bbMean = 0, bbUp = 0, bbLo = 0, bbPos = "mid";
  if (closes.length >= 22) {
    const w = closes.slice(-20); bbMean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - bbMean) ** 2, 0) / w.length);
    bbUp = bbMean + 2 * sd; bbLo = bbMean - 2 * sd;
    bbPos = last > bbUp ? "above the upper band" : last < bbLo ? "below the lower band" : last > bbMean ? "in the upper half of the bands" : "in the lower half of the bands";
  }
  const resist = last < hi ? hi : hi4 > last ? hi4 : hi;
  const support = last > lo ? lo : lo4 < last ? lo4 : lo;
  return {
    last, trend, atr: a, atrPct, ch15: ch(15), ch60: ch(60), ch24h: ch(Math.min(n, 1439)),
    hi, lo, hi4, lo4, resist, support, vol, rsi14: r14, bbMean, bbUp, bbLo, bbPos, bars: cs.length,
  };
}

/** Full TA-style analysis grounded only in live candle math. */
export function analysisRead(c: TalkCtx): string {
  const m = marketRead(c);
  if (!m) return `I don't have enough candles yet for a real read on ${c.coin}. Give the feed a minute.`;
  const sr = setupRead(c);
  const lean = m.trend === "up" ? "bullish short-term bias" : m.trend === "down" ? "bearish short-term bias" : "neutral short-term bias";
  const ch1 = m.ch60 != null ? `${pct(m.ch60)} over 1h` : "1h change n/a";
  const ch24 = m.ch24h != null && m.bars >= 200 ? `${pct(m.ch24h)} over ~24h` : "24h change needs more candles";
  const toRes = ((m.resist - m.last) / m.last) * 100, toSup = ((m.last - m.support) / m.last) * 100;
  const setupLine = sr.ready ? "My strategy already has a setup on the latest closed candle." : "My strategy does not have a setup yet.";
  return `${pick(["Here's my read on", "Quick analysis on", "Numbers only on"], c.seed)} ${c.coin}: price ${px(m.last)}, ${ch1}, ${ch24}. Trend ${m.trend}, RSI 14 at ${m.rsi14.toFixed(1)}, sitting ${m.bbPos} (mid ${px(m.bbMean)}, lower ${px(m.bbLo)}, upper ${px(m.bbUp)}). Volatility ${m.vol}, ATR 14 ${px(m.atr)} (${m.atrPct.toFixed(3)}% per minute). Nearest support ${px(m.support)} (${toSup.toFixed(2)}% below), resistance ${px(m.resist)} (${toRes.toFixed(2)}% above). ${setupLine} Overall ${lean}.${disc}`;
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

/** Strip curly/smart quotes and odd punctuation for matching. */
export function scrubTalk(raw: string): string {
  return raw.toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\u02BB']/g, "")
    .replace(/[\u201C\u201D\u201E]/g, "")
    .replace(/[^a-z0-9%$.?\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function converse(raw: string, c: TalkCtx): TalkReply | null {
  const q = ` ${scrubTalk(raw)} `;
  const m = marketRead(c);
  const mine = c.positions.find((p) => p.by === "agent-auto");
  const sess = c.running ? `I'm on shift${c.until ? ` until ${hhmm(c.until)}` : " until you say pause"}` : "I'm paused right now";
  const agentFills = c.fills.filter((f) => f.by === "agent-auto");
  const wins = agentFills.filter((f) => f.pnl > 0).length;
  const mood = () => (m ? `${c.coin} is ${px(m.last)}, ${m.ch60 != null ? `${pct(m.ch60)} over the last hour` : "no hourly change yet"}, trend ${m.trend}, volatility ${m.vol} (ATR ${m.atrPct.toFixed(3)}% per minute).` : `I don't have enough candles yet for a read on ${c.coin}.`);
  const say = (text: string, topic: string): TalkReply => ({ text, topic });

  // follow ups that lean on the last topic
  if (T(/^ (and |so )?(why( not)?|how come|really|explain( that)?|what does that mean|meaning)\s?\?? $/, q) && c.lastTopic) {
    if (c.lastTopic === "setup") return say(`Because both conditions have to line up on a closed candle. ${setupRead(c).text}`, "setup");
    if (c.lastTopic === "skip") return say(c.lastNote ? `Last thing I noted: ${c.lastNote}. The guardrails are Max Size ${usd(c.maxSize)} and Max Daily Loss ${usd(c.maxLoss)}.` : "I haven't skipped anything this session.", "skip");
    if (c.lastTopic === "opinion" || c.lastTopic === "analysis") return say(analysisRead(c), "analysis");
  }
  const CANON: Record<string, string> = { setup: "what setup are you looking for", market: "how is the market looking", opinion: "should i long now", analysis: "whats your analysis", positions: "what positions do i have", session: "are you running", pnl: "how much money have i made", stats: "win rate", skip: "why no trades" };
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

  // analysis / opinion / TA
  const wantsAnalysis = T(/\b(analys[ei]s|analy[sz]e|thoughts?|opinion|outlook|view|take|bias|prediction|forecast|breakdown|ta\b|technical|levels?|support|resistance|s\/r|bullish|bearish|pumping|dumping|pump\b|dump\b|where (is|are|will)|what do you think|your (read|take|view|bias|call)|good time|should i|would you|do you think|worth it|ape|long now|short now|buy now|go long|go short|what would you do)\b/, q)
    || T(/\b(whats?|what is|give me|tell me|share|got|any)\b.{0,40}\b(analys[ei]s|read|take|view|outlook|thoughts?|opinion|bias|ta)\b/, q);
  if (wantsAnalysis) {
    if (!m) return say(`Not enough data for a view yet.${disc}`, "analysis");
    const wantShort = /\b(short|sell|bearish|down|dump)\b/.test(q) && !/\b(long|buy|bullish|up|pump)\b/.test(q);
    const wantLong = /\b(long|buy|bullish|up|pump)\b/.test(q) && !/\b(short|sell|bearish|down|dump)\b/.test(q);
    if (wantLong || wantShort) {
      const sr = setupRead(c);
      const lean = m.trend === "up" ? "the short term trend is up" : m.trend === "down" ? "the short term trend is down" : "there's no clear short term trend";
      const fit = wantLong ? (m.trend === "up" ? "A long goes with the short term trend." : m.trend === "down" ? "A long fights the short term trend." : "A long has no trend behind it.")
        : (m.trend === "down" ? "A short goes with the short term trend." : m.trend === "up" ? "A short fights the short term trend." : "A short has no trend behind it.");
      return say(`${analysisRead(c)} ${fit} ${sr.ready ? "My strategy actually has a setup right now." : "My own strategy doesn't have a setup yet, so I'd be waiting."}${m.rsi14 > 70 ? " RSI is hot, chasing a long here is risky." : m.rsi14 < 30 ? " RSI is washed out, shorting here is risky." : ""} If you do trade, size small and set a stop.`, "analysis");
    }
    return say(analysisRead(c), "analysis");
  }

  // market snapshot
  const coinAsked = q.match(/\b(btc|bitcoin|eth|ether|ethereum|sol|solana|hype|xrp|doge|sui|avax|link|bnb|near|aave)\b/);
  if (T(/\b(how.?s|how is|hows|looking|market|price|chart|trend|vol|volatil\w*|moving|pumping|dumping|up or down|direction|what.?s .* (at|doing)|whats the (price|chart|trend))\b/, q) || (coinAsked && (T(/\?/, q) || T(/\b(look|price|chart|trend|status|update)\b/, q)))) {
    if (!m) return say(mood(), "market");
    const range = `Last hour range ${px(m.lo)} to ${px(m.hi)}.`;
    const vibe = m.trend === "up" ? pick(["Bulls have the wheel for now.", "Grinding higher."], c.seed) : m.trend === "down" ? pick(["Sellers are leaning on it.", "Drifting lower."], c.seed) : pick(["Chopping sideways.", "Going nowhere fast."], c.seed);
    return say(`${mood()} ${range} Support ${px(m.support)}, resistance ${px(m.resist)}. ${vibe}`, "market");
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

  // Any leftover question, question-word opener, or coin mention gets a real market/analysis read, never silence.
  const looksAsk = T(/\?\s*$/, q) || T(/^ (what|whats|why|how|hows|when|where|who|is|are|do|does|can|could|should|will|would|any|tell|give|share)\b/, q) || Boolean(coinAsked);
  if (looksAsk) {
    if (m) return say(`${pick(["Not sure I caught the exact ask, so here's the live read.", "I'll give you the market instead.", "Quick read while I catch up:"], c.seed)} ${analysisRead(c)}`, "analysis");
    return say(`Not sure I follow, but here's where things stand. ${mood()} ${sess}. You can ask me "What Setup Are You Looking For?", "How's ${c.coin} Looking?", "Should I Long Now?" or "Why No Trades?".`, "fallback");
  }
  return null;
}

/** True when the message looks like chat/question, not a trading command. */
export function looksLikeTalk(raw: string): boolean {
  const lo = scrubTalk(raw);
  if (!lo) return false;
  if (/\?\s*$/.test(lo)) return true;
  if (/^(what|whats|why|how|hows|should|is|are|do|does|did|when|would|will|who|where|explain|tell me|any|thoughts|opinion|analyse|analyze|analysis|outlook|bias|prediction|forecast|breakdown|bullish|bearish)\b/.test(lo)) return true;
  if (/\b(analys[ei]s|analy[sz]e|thoughts?|opinion|outlook|your (view|take|read|bias)|what do you think|where is|support|resistance|levels?|ta\b)\b/.test(lo)) return true;
  if (coinMentioned(raw) && !/\b(long|short|buy|sell|close|exit|dump|flatten|pause|stop|resume|start|leverage|lev\b|confirm|cancel|trade for me|run (it|the)|set )\b/.test(lo)) return true;
  return false;
}

export const ASK_CHIPS = (coin: string) => ["What Setup Are You Looking For?", `How's ${coin} Looking?`, `What's Your Analysis On ${coin}?`, "Should I Long Now?", "Why No Trades Yet?", "What's My Risk?", "Explain RSI"];
