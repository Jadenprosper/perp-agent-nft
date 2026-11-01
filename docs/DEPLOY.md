# Deploy notes (NEAR testnet)

1. Create / fund a testnet account (NEAR faucet).
2. Build wasm: `cd contract && RUSTFLAGS='--cfg near' cargo build --target wasm32-unknown-unknown --release`
3. Copy: `cp target/wasm32-unknown-unknown/release/perp_agent_nft.wasm res/`
4. Deploy with near-cli / cargo-near to `<you>.testnet`.
5. Init: call `new` with owner if required by the contract ABI.
6. Set `NEXT_PUBLIC_NFT_CONTRACT` in the web app to that account.
7. Mint via `mint_agent` (one per wallet, max 100) or use the demo API store for UI-only demos.

Do **not** submit the hackathon entry or post on X until Didi approves.
