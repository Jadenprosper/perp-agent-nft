# Bag Worker

An NFT that is a perp trading agent. Own the NFT, own the desk.

Bag Worker is a NEP-171 collection on NEAR testnet. Each token is a unique agent with its own strategy, market defaults, and art. Holders mint free, open the Trade desk, and chat with the agent in plain English. Prices come from live Hyperliquid mainnet market data (read only). Every fill on the desk is a paper trade stored in the browser. Nothing is signed or sent to Hyperliquid.

Built for the NEAR Hackathon track **NFTs That Do Something**. Testnet only. Paper trading only.

## Live Links

- GitHub Pages: https://jadenprosper.github.io/perp-agent-nft
- Vercel: https://bagworker-nft.vercel.app
- Repo: https://github.com/Jadenprosper/perp-agent-nft
- Contract: `perp-agent-nft.testnet` (NEAR testnet)

## Features

- **Free Mint On NEAR Testnet.** Max supply 100. One mint per wallet. Ownership transfers with the NFT.
- **Gallery And Mint Picker.** Browse all 100 Bag Workers, traits, and taken status. Mint the face you want on the desk.
- **12 Markets.** BTC, ETH, SOL, HYPE, XRP, DOGE, SUI, AVAX, LINK, BNB, NEAR, AAVE. Phone-friendly market chips. Positions can stay open across several markets at once.
- **Conversational Trading Buddy.** Chat commands (`long sol 50`, `close eth`, `trade for me for 2h`) plus natural questions (`What's your analysis on BTC?`, `How's SOL looking?`). Replies use live candle math only. No invented numbers.
- **Draft Orders With Confirm.** Incomplete opens become a draft. Answer with SL, TP, margin, Confirm, or Cancel. New commands are never blocked by a pending draft.
- **Timed Agent Sessions.** `Trade For Me For 2h` runs the agent's strategy until the end time. If the phone sleeps or the tab closes, catch-up replays missed 1m candles when you return.
- **Guardrails.** Max position size, max daily loss with Raise Limit and Reset Paper Balance, leverage with a hard cap, TP / SL / liquidation lines on the chart.
- **Chart Lines And Markers.** Entry, TP, SL, liquidation overlays plus entry and exit markers on closed trades.
- **PnL Cards.** Shareable scene cards for open or closed trades, with the correct market label.
- **Desk Gating.** Orders and the auto trader unlock for the wallet that holds the NFT. Preview mode for everyone else.

## Tech Stack

| Layer | Tech |
| --- | --- |
| Contract | Rust / `near-sdk`, NEP-171, max supply 100, one mint per wallet |
| Web | Next.js 15, React 19, Tailwind, lightweight-charts, NEAR Wallet Selector (Meteor / MyNearWallet) |
| Market Data | Hyperliquid public info + websocket APIs, read only |
| Paper Engine | Client-side strategy eval, fills, sessions, and chat in the browser |
| Optional API | FastAPI agent service under `agent/` for dry-run / demo helpers |
| Deploy | Static export to GitHub Pages (`/perp-agent-nft` base path) and Vercel (root path) |

## Contract (NEAR Testnet)

Account: `perp-agent-nft.testnet`

Useful views and calls:

- `mint_agent(token_id)`: free mint for ids `1..=100`, one per wallet
- `get_mint_stats()`: `{ minted, max_supply, remaining, sold_out }`
- `get_minted_ids()`: minted token ids
- `nft_transfer`: moves control with the token
- Media and metadata served as `/agents/{id}.jpg` and `/metadata/{id}.json` on the static site

Build wasm:

```bash
cd contract
RUSTFLAGS='--cfg near' cargo test
RUSTFLAGS='--cfg near' cargo build --target wasm32-unknown-unknown --release
# wasm: res/perp_agent_nft.wasm
```

More deploy notes: `docs/DEPLOY.md`.

## Run Locally

```bash
# Web (main app)
cd web
npm install
npm run dev
# http://localhost:3000
```

Point `NEXT_PUBLIC_NFT_CONTRACT` at `perp-agent-nft.testnet` (default) and use a NEAR testnet wallet.

Static export used for GitHub Pages:

```bash
cd web
STATIC_EXPORT=1 \
  NEXT_PUBLIC_BASE_PATH=/perp-agent-nft \
  NEXT_PUBLIC_NFT_CONTRACT=perp-agent-nft.testnet \
  npx next build
# output: web/out
```

Root-path export (Vercel style): same command with `NEXT_PUBLIC_BASE_PATH` empty.

Optional API (dry-run helpers, not required for the live paper desk):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn agent.main:app --reload --port 8787
```

## Tests

```bash
cd web
npx tsx scripts-intent-test.mts   # chat command parser
npx tsx scripts-talk-test.mts     # conversational replies against live candles
```

Contract:

```bash
cd contract
RUSTFLAGS='--cfg near' cargo test
```

## Notes

- Paper trading only. Not financial advice. Not production custody.
- Live prices are Hyperliquid mainnet market data. Fills are simulated locally.
- GitHub Pages serves under `/perp-agent-nft`. Vercel serves at the site root.

## License

MIT. Built for NEAR Hackathon 2026.
