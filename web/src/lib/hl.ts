/** Hyperliquid public market data (mainnet info API, read-only — no signing). */
export const HL_INFO = "https://api.hyperliquid.xyz/info";
export const HL_WS = "wss://api.hyperliquid.xyz/ws";

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type BookLevel = { px: number; sz: number };
export type Book = { bids: BookLevel[]; asks: BookLevel[] };
export type Trade = { px: number; sz: number; side: "B" | "A"; time: number; tid: number };

type RawCandle = { t: number; o: string; h: string; l: string; c: string; v: string };
const toCandle = (c: RawCandle): Candle => ({ time: Math.floor(c.t / 1000), open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v });

export async function fetchCandles(coin: string, interval = "1m", bars = 300): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - bars * 60_000;
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }),
  });
  if (!res.ok) throw new Error(`Candles Failed (${res.status})`);
  const raw = (await res.json()) as RawCandle[];
  return raw.map(toCandle);
}

export function subscribeMarket(
  coin: string,
  handlers: { onCandle: (c: Candle) => void; onBook: (b: Book) => void; onTrades: (t: Trade[]) => void; onStatus?: (s: string) => void }
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const open = () => {
    ws = new WebSocket(HL_WS);
    handlers.onStatus?.("Connecting");
    ws.onopen = () => {
      handlers.onStatus?.("Live");
      for (const subscription of [
        { type: "candle", coin, interval: "1m" },
        { type: "l2Book", coin },
        { type: "trades", coin },
      ]) ws?.send(JSON.stringify({ method: "subscribe", subscription }));
      ping = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ method: "ping" })), 30_000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.channel === "candle" && msg.data?.s === coin) handlers.onCandle(toCandle(msg.data));
        else if (msg.channel === "l2Book" && msg.data?.coin === coin) {
          const [b, a] = msg.data.levels as { px: string; sz: string }[][];
          handlers.onBook({ bids: b.map((l) => ({ px: +l.px, sz: +l.sz })), asks: a.map((l) => ({ px: +l.px, sz: +l.sz })) });
        } else if (msg.channel === "trades" && Array.isArray(msg.data)) {
          handlers.onTrades(
            (msg.data as { coin: string; px: string; sz: string; side: "B" | "A"; time: number; tid: number }[])
              .filter((t) => t.coin === coin)
              .map((t) => ({ px: +t.px, sz: +t.sz, side: t.side, time: t.time, tid: t.tid }))
          );
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (ping) clearInterval(ping);
      if (closed) return;
      handlers.onStatus?.("Reconnecting");
      retry = setTimeout(open, 2500);
    };
    ws.onerror = () => ws?.close();
  };
  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    if (ping) clearInterval(ping);
    ws?.close();
  };
}
