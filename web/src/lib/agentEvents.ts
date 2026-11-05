/** Tiny event emitter: auto-trader decisions → animated agent reactions. */
export type AgentEvent =
  | { type: "entry"; side: "long" | "short"; reason: string }
  | { type: "win"; pnl: number; reason: string }
  | { type: "loss"; pnl: number; reason: string }
  | { type: "paused" }
  | { type: "running" }
  | { type: "say"; text: string };

type Fn = (e: AgentEvent) => void;
const listeners = new Set<Fn>();
export const agentEvents = {
  on(fn: Fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  emit(e: AgentEvent) { listeners.forEach((fn) => fn(e)); },
};
