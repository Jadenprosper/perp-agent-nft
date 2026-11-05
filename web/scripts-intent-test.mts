import { parseIntent } from "./src/lib/intent";
const cases: [string, string, Record<string, unknown>?][] = [
  ["close my position", "close"], ["Close All", "close"], ["close everything", "close"], ["get me out", "close"], ["get me out of this", "close"],
  ["dump my btc", "close", { coin: "BTC" }], ["sell everything", "close"], ["exit", "close"], ["exit the trade", "close"], ["cash out", "close"],
  ["clsoe all", "close"], ["pls close it", "close"], ["take profit now", "close"], ["flatten", "close"], ["close btc", "close", { coin: "BTC" }],
  ["go long on btc with 50 bucks", "open", { side: "long", coin: "BTC", usd: 50 }], ["long btc 100 sl 2% tp 4%", "open", { side: "long", usd: 100 }],
  ["buy 200", "open", { side: "long", usd: 200 }], ["short eth $75", "open", { side: "short", coin: "ETH", usd: 75 }], ["lnog btc 20 dollars", "open", { side: "long", usd: 20 }],
  ["short it with 1k", "open", { side: "short", usd: 1000 }], ["go short", "open", { side: "short", usd: null }],
  ["stop the bot", "pause"], ["stop", "pause"], ["pause", "pause"], ["turn it off", "pause"], ["chill", "pause"], ["halt trading", "pause"],
  ["how am i doing", "status"], ["how we doing?", "status"], ["status", "status"], ["whats my pnl", "status"], ["balance", "status"], ["am i up", "status"],
  ["trade for me for 2 hours", "trade_for_me", { hours: 2 }], ["Trade For Me For 2h", "trade_for_me", { hours: 2 }], ["run it for 30 mins", "trade_for_me", { hours: 0.5 }],
  ["trade for me for an hour", "trade_for_me", { hours: 1 }], ["run for 90 minutes", "trade_for_me", { hours: 1.5 }], ["auto trade", "trade_for_me", { hours: null }],
  ["trade for me today", "trade_for_me", { hours: "today" }], ["trde for me for 3 hrs", "trade_for_me", { hours: 3 }], ["run the bot for half an hour", "trade_for_me", { hours: 0.5 }],
  ["set leverage to 20", "leverage", { value: 20 }], ["leverage 50x", "leverage", { value: 50 }], ["use 10x", "leverage", { value: 10 }], ["levrage 5", "leverage", { value: 5 }],
  ["stop loss 2 percent", "set_sl", { level: { value: 2, pct: true } }], ["set stop loss at 1.5%", "set_sl"], ["sl 3%", "set_sl"], ["stoploss 2%", "set_sl"],
  ["take profit 4%", "set_tp"], ["tp at 5 percent", "set_tp"], ["target 3%", "set_tp"],
  ["set max daily loss 300", "max_loss", { usd: 300 }], ["daily loss limit 500", "max_loss", { usd: 500 }], ["max size 2000", "max_size", { usd: 2000 }],
  ["confirm", "confirm"], ["yes", "confirm"], ["yep do it", "confirm"], ["cancel", "cancel"], ["nah", "cancel"], ["nevermind", "cancel"],
  ["resume", "resume"], ["start the bot", "resume"], ["wake up", "resume"], ["help", "help"], ["what can you do", "help"], ["banana", "unknown"],
];
let fail = 0;
for (const [q, kind, extra] of cases) {
  const r = parseIntent(q) as Record<string, unknown>;
  const ok = r.kind === kind && Object.entries(extra ?? {}).every(([k, v]) => JSON.stringify(r[k]) === JSON.stringify(v));
  if (!ok) { fail++; console.log("FAIL", JSON.stringify(q), "->", JSON.stringify(r), "want", kind, JSON.stringify(extra ?? {})); }
}
console.log(`${cases.length - fail}/${cases.length} Pass`); if (fail) process.exit(1);
