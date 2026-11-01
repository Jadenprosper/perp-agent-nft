# Didi — remaining steps (do not auto-submit / auto-post)

Deadline: NEAR Hackathon **2026-11-14 23:59 UTC** (Nov 15 00:59 Africa/Lagos).

## Done in repo

- Contract: `MAX_SUPPLY = 100`, one mint/wallet, traits, `get_mint_stats`, wasm in `contract/res/`
- API: `/api/mint-stats`, trait portraits, mirrored supply rules (9 pytest OK)
- Web: Wallet Selector (Meteor / MyNearWallet), live `x/100`, locked desk, sold-out panel
- Public GitHub: https://github.com/Jadenprosper/perp-agent-nft

## Needs you (confirm before spend / wallet / X)

1. **NEAR testnet account + faucet** — fund the deployer account.
2. **Deploy** `contract/res/perp_agent_nft.wasm` to testnet; set `NEXT_PUBLIC_NFT_CONTRACT`.
3. **Optional HL testnet key** — only if leaving dry-run; never mainnet.
4. **Screenshots** — refresh `docs/screenshots/*` from localhost:3000 after wallet connect (generated mocks may also be in workspace).
5. **X demo** — you post, tagging @NEARProtocol #NEARHackathon (do not auto-post).
6. **Submit** on nearhackathon.com only with your explicit OK.

## Local demo

```bash
./scripts/dev.sh   # or uvicorn :8787 + npm run dev :3000
```
