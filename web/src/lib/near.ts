"use client";

import { setupWalletSelector, type WalletSelector, type WalletModuleFactory } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMeteorWalletApp } from "@near-wallet-selector/meteor-wallet-app";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupWalletConnect } from "@near-wallet-selector/wallet-connect";

export const NETWORK_ID = (process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet") as
  | "testnet"
  | "mainnet";

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_NFT_CONTRACT || "perp-agent-nft.testnet";

export const WC_PROJECT_ID = (
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || "4313f4a6fd453f6be60baa5c554e8971"
).trim();

let selectorPromise: Promise<WalletSelector> | null = null;
let modal: WalletSelectorModal | null = null;

type MeteorWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __is_running_in_meteor_wallet_app__?: boolean;
};

export function isMeteorInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as MeteorWindow;
  return Boolean(w.__is_running_in_meteor_wallet_app__ || w.ReactNativeWebView?.postMessage);
}

export function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Best-effort handoff into the Meteor Android/iOS app (not the web wallet). */
export function tryOpenMeteorNativeApp(dappUrl?: string): { attempted: boolean; method: string } {
  if (typeof window === "undefined") return { attempted: false, method: "none" };
  const url = dappUrl || window.location.href;
  const encoded = encodeURIComponent(url);
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  try {
    if (isAndroid) {
      // Force the installed Meteor package instead of the web wallet SPA.
      const intent =
        `intent://wallet.meteorwallet.app/#Intent;` +
        `scheme=https;package=app.meteorwallet.v2;` +
        `S.browser_fallback_url=${encodeURIComponent("https://wallet.meteorwallet.app")};` +
        `end`;
      window.location.href = intent;
      return { attempted: true, method: "android-intent" };
    }
    if (isIOS) {
      // Custom scheme first; falls through to universal / App Store if missing.
      const scheme = `meteorwallet://dapp?url=${encoded}`;
      const started = Date.now();
      window.location.href = scheme;
      window.setTimeout(() => {
        if (Date.now() - started < 1600) {
          // Soft fallback: Meteor web (may open app via associated domains on some builds).
          window.location.href = `https://wallet.meteorwallet.app`;
        }
      }, 900);
      return { attempted: true, method: "ios-scheme" };
    }
  } catch {
    /* ignore */
  }
  return { attempted: false, method: "none" };
}

function buildModules(): WalletModuleFactory[] {
  const modules: WalletModuleFactory[] = [];

  // Injected Meteor in-app browser wallet (auto-runs on startup when present).
  modules.push(
    setupMeteorWalletApp({
      contractId: CONTRACT_ID,
    })
  );

  // WalletConnect bridge — Meteor Mobile and other WC wallets. Needs a free Reown projectId.
  if (WC_PROJECT_ID) {
    modules.push(
      setupWalletConnect({
        projectId: WC_PROJECT_ID,
        metadata: {
          name: "Perp Agent NFT",
          description: "NEAR Hackathon — NFT That Trades Perps (Testnet)",
          url: "https://jadenprosper.github.io/perp-agent-nft/",
          icons: [
            "https://jadenprosper.github.io/perp-agent-nft/agents/1.jpg",
          ],
        },
        chainId: NETWORK_ID === "mainnet" ? "near:mainnet" : "near:testnet",
      })
    );
  }

  // Desktop / extension / web Meteor + MyNearWallet fallbacks.
  modules.push(setupMeteorWallet());
  modules.push(setupMyNearWallet());

  return modules;
}

export async function getSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK_ID,
      modules: buildModules(),
    });
  }
  return selectorPromise;
}

export async function getModal(): Promise<WalletSelectorModal> {
  const selector = await getSelector();
  if (!modal) {
    modal = setupModal(selector, {
      contractId: CONTRACT_ID,
      description: isMobileUa()
        ? WC_PROJECT_ID
          ? "Mobile: Prefer WalletConnect → Meteor. Desktop Options Stay Available."
          : "Mobile: Open This Site Inside The Meteor App Browser, Or Use Meteor Wallet / MyNearWallet."
        : "Connect To Mint / Run Your One-Per-Wallet Perp Agent (Testnet)",
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

/** Prefer Meteor in-app injected wallet when the page is inside Meteor. */
export async function connectMeteorInApp(): Promise<string | null> {
  const selector = await getSelector();
  const wallet = await selector.wallet("meteor-wallet-app");
  const accounts = await wallet.signIn({ contractId: CONTRACT_ID } as never);
  return accounts[0]?.accountId ?? null;
}

type MeteorExtWindow = Window & { meteorCom?: unknown; meteorWallet?: unknown };

/** True when the Meteor browser extension has injected its bridge into the page. */
export function isMeteorExtensionInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as MeteorExtWindow;
  return Boolean(w.meteorCom || w.meteorWallet);
}

/**
 * Browser connect via @near-wallet-selector/meteor-wallet. Uses the Meteor extension
 * when injected, otherwise opens the wallet.meteorwallet.app web wallet (popup/redirect).
 */
export async function connectMeteorBrowser(): Promise<string | null> {
  const selector = await getSelector();
  const wallet = await selector.wallet("meteor-wallet");
  const accounts = await wallet.signIn({ contractId: CONTRACT_ID } as never);
  return accounts?.[0]?.accountId ?? (await getAccountId());
}
