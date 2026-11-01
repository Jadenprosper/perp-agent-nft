# Deploy Perp Agent NFT to NEAR testnet

Prerequisites: a NEAR testnet account + `cargo near` (or `near-cli-rs`).

```bash
# from repo root
cd contract
# build (requires rustc + wasm32 target)
RUSTFLAGS='--cfg near' cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/perp_agent_nft.wasm res/

# create contract account (example)
near create-account perp-agent.YOUR.testnet --masterAccount YOUR.testnet

# deploy + init
near deploy perp-agent.YOUR.testnet res/perp_agent_nft.wasm
near call perp-agent.YOUR.testnet new_default_meta '{"owner_id":"YOUR.testnet"}' --accountId YOUR.testnet

# mint
near call perp-agent.YOUR.testnet mint_agent \
  '{"token_owner_id":"YOUR.testnet","title":"Agent Alpha","rules":"long ETH at 3200, TP 3500, SL 3100"}' \
  --accountId YOUR.testnet --deposit 0.05
```

Faucet: https://near-faucet.io/ or `near create-account` with faucet.

Then set `NEAR_CONTRACT_ID=perp-agent.YOUR.testnet` for the agent service (on-chain ownership checks can be wired next).
