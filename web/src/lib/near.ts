"use client";

import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

export const NETWORK_ID = (process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet") as
  | "testnet"
  | "mainnet";

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_NFT_CONTRACT || "perp-agent-nft.testnet";

let selectorPromise: Promise<WalletSelector> | null = null;
let modal: WalletSelectorModal | null = null;

export async function getSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK_ID,
      modules: [setupMeteorWallet(), setupMyNearWallet()],
    });
  }
  return selectorPromise;
}

export async function getModal(): Promise<WalletSelectorModal> {
  const selector = await getSelector();
  if (!modal) {
    modal = setupModal(selector, {
      contractId: CONTRACT_ID,
      description: "connect to mint / run your one-per-wallet perp agent (testnet)",
    });
  }
  return modal;
}

export async function getAccountId(): Promise<string | null> {
  const selector = await getSelector();
  if (!selector.isSignedIn()) return null;
  const accounts = selector.store.getState().accounts;
  return accounts.find((a) => a.active)?.accountId ?? accounts[0]?.accountId ?? null;
}
