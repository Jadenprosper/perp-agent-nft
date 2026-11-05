import { converse, type TalkCtx } from "./src/lib/talk";
import { parseIntent } from "./src/lib/intent";
import { agentConfig } from "./src/lib/agentConfig";
const cfg = agentConfig(1);
const end = Date.now();
const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "candleSnapshot", req: { coin: cfg.market, interval: "1m", startTime: end - 300 * 60000, endTime: end } }) });
const cs = (await r.json()).map((x: any) => ({ time: x.t / 1000, open: +x.o, high: +x.h, low: +x.l, close: +x.c, volume: +x.v }));
const ctx: TalkCtx = { name: "Lord Leverage", coin: cfg.market, strategy: cfg.strategy, closed: cs.slice(0, -1), price: cs[cs.length - 1].close, running: true, until: Date.now() + 90 * 60000,
  lastNote: "Watching, No Setup Yet", lastCheckAt: Date.now(), positions: [{ id: "a", side: "long", size: 0.001, entry: cs[cs.length - 5].close, sl: cs[cs.length - 5].close * 0.99, openedAt: Date.now(), by: "you", lev: 20 }],
  fills: [{ id: "f", side: "short", size: 0.001, entry: 1, exit: 1, pnl: 3.2, openedAt: 0, closedAt: Date.now(), by: "agent-auto", reason: "x" }], cash: 9800, lev: 20, maxSize: 1000, maxLoss: 200, today: -12.5 };
const qs = ["What setup are you looking for?", "what are you waiting for", "when will you buy?", "whats the plan", "and now?", "why?", "How's BTC looking?", "hows bitcoin", "is btc pumping?", "what's the trend", "how volatile is it", "how's ETH looking?",
  "should i long now?", "should I short?", "do you think it goes up?", "is it a good time to buy", "what would you do", "bullish or bearish?", "your take?",
  "why no trades?", "why haven't you traded", "did you skip anything", "nothing happening?", "what's my risk?", "what positions do i have", "what's open",
  "win rate?", "how many trades have you made", "how much money have i made", "am i up", "what's my balance", "are you running?", "when does the session end", "time left?",
  "what is rsi", "explain bollinger bands", "what's atr", "what is leverage", "what does liquidation mean", "explain stop loss", "is this real money?", "what's an ema",
  "hi", "hey there", "gm", "how are you?", "who are you", "thanks", "tell me a joke", "lol", "what's the meaning of life?", "blah blah", "close everything", "stop the bot", "set leverage to 20", "can you close my position?"];
let n = 0, bad = 0;
for (const q of qs) {
  const it = parseIntent(q); const lo = q.toLowerCase();
  const isQ = /^(what|whats|why|how|hows|should|is|are|do|does|did|when|would|will|who|where|explain|tell me|any|thoughts|opinion)\b/.test(lo) || /\?\s*$/.test(lo);
  const routed = it.kind === "unknown" || (isQ && !/^(can|could) you\b/.test(lo));
  let rep = routed ? converse(q, { ...ctx, lastTopic: (globalThis as any).lt }) : null;
  if (rep && rep.topic === "fallback" && it.kind !== "unknown") rep = null;
  if (rep) (globalThis as any).lt = rep.topic;
  n++; const out = rep ? `[${rep.topic}] ${rep.text}` : `-> command ${it.kind}`;
  if (/—/.test(out) || /NaN|undefined|Infinity/.test(out)) bad++;
  console.log(`Q: ${q}\nA: ${out}\n`);
}
for (const coin of ["SOL", "ETH", "HYPE", "DOGE", "SUI"]) {
  const r2 = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "1m", startTime: end - 300 * 60000, endTime: end } }) });
  const c2 = (await r2.json()).map((x: any) => ({ time: x.t / 1000, open: +x.o, high: +x.h, low: +x.l, close: +x.c, volume: +x.v }));
  for (const q of [`how's ${coin.toLowerCase()} looking?`, `what setup on ${coin}?`, `should i long ${coin.toLowerCase()} now?`]) {
    const rep = converse(q, { ...ctx, coin, closed: c2.slice(0, -1), price: c2[c2.length - 1].close, positions: [] });
    n++; const out = rep ? `[${rep.topic}] ${rep.text}` : "null"; if (!rep || /—|NaN|undefined|Infinity/.test(out) || !out.includes(coin)) bad++;
    console.log(`Q: ${q}\nA: ${out}\n`);
  }
}
console.log(`${n} Questions, ${bad} Bad`);
