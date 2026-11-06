# Bag Worker · Hackathon Submission Draft

Status: draft only. Do not submit until Didi approves. Demo video still needs a public URL.

Hackathon: NEAR Hackathon 2026 · track **NFTs That Do Something** · deadline 2026-11-14 23:59 UTC.
Submit site (when ready): nearhackathon.com

## Project Name

Bag Worker

## One-Liner

An NFT that is a paper perp trading agent on NEAR. Own the JPEG, own the desk.

## Description

Bag Worker is a collection of 100 NEP-171 agent NFTs on NEAR testnet. Each token is a unique Bag Worker with its own art, traits, default market, and strategy. Mint is free and limited to one per wallet. The holder opens a Trade desk, picks among 12 Hyperliquid perps, and talks to the agent in plain English.

The agent runs paper trades only. Prices are live Hyperliquid mainnet market data (read only). Strategy sessions, chat drafts, daily loss limits, chart overlays, and shareable PnL cards all run in the browser. Transfer the NFT and control of the desk moves with it.

Live apps:

- https://jadenprosper.github.io/perp-agent-nft
- https://bagworker-nft.vercel.app

Repo: https://github.com/Jadenprosper/perp-agent-nft
Contract: `perp-agent-nft.testnet`

## Problem

Most NFT drops stop at the JPEG. Most trading bots stop at a API key and a dashboard. There is no simple, ownable object that ties identity, strategy, and a trading desk together on-chain for builders and demo users on NEAR.

Bag Worker makes the NFT the agent. Ownership is the access key. The desk is gated by who holds the token. The chat is the interface.

## How It Works

1. Connect a NEAR testnet wallet (Meteor or MyNearWallet).
2. Mint one of 100 Bag Workers for free (one per wallet).
3. Open the Trade desk for that token.
4. Switch markets with the chip picker (BTC, ETH, SOL, HYPE, XRP, DOGE, SUI, AVAX, LINK, BNB, NEAR, AAVE).
5. Chat with the agent: open drafts (`long sol 50 sl 2% tp 4%`), confirm or cancel, close positions, set leverage, raise the daily loss limit, or ask for analysis (`What's your analysis on BTC?`).
6. Start a timed session (`Trade For Me For 2h`). The strategy watches 1m candles. If the phone sleeps, catch-up replays missed candles when you return.
7. Share a PnL card for an open or closed trade.

Everything on the desk is paper. Nothing is signed to Hyperliquid.

## NEAR Usage

- NEP-171 NFT contract on NEAR testnet: `perp-agent-nft.testnet`
- Free `mint_agent` with max supply 100 and one mint per wallet
- Ownership gates trading: only the holder can run the desk and chat trades
- Transfer moves control to the new owner
- Wallet Selector integration (Meteor / MyNearWallet)
- On-chain views for mint stats and minted ids drive the live counter and picker

## Tech Stack

- Contract: Rust / near-sdk (NEP-171 + mint supply rules)
- Web: Next.js 15, React 19, Tailwind, lightweight-charts, NEAR Wallet Selector
- Market data: Hyperliquid public REST + websocket (read only)
- Paper engine + intent parser + conversational talk layer in the browser
- Static deploys to GitHub Pages and Vercel

## Links

- GitHub Pages: https://jadenprosper.github.io/perp-agent-nft
- Vercel: https://bagworker-nft.vercel.app
- GitHub: https://github.com/Jadenprosper/perp-agent-nft
- Contract: `perp-agent-nft.testnet`
- Demo video: **TODO · needs a public URL from Didi**
  - Local file ready: `/workspace/bagworker-motion/bagworker-16x9.mp4`
  - Suggested hosts: YouTube unlisted, Vimeo, or a public Drive / R2 link
- X demo post: **TODO · Didi posts manually**, tag @NEARProtocol #NEARHackathon

## Demo Video Script Notes (Optional)

Show: mint flow → gallery → Trade desk → market switch → chat open and confirm → timed session status → PnL card. Keep it under two minutes. End on the live URL.

## Submission Checklist (For Didi)

- [ ] Paste fields above into nearhackathon.com
- [ ] Upload or link the demo video (public URL)
- [ ] Confirm contract account and live URLs still load
- [ ] Optional X post after submit
- [ ] Do not enable paid features or mainnet keys

## Disclaimer

Paper trading only. Not financial advice. Testnet NFT. Live prices are public market data; fills are simulated.
