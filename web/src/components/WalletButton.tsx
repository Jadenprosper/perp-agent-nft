"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, Smartphone, Wallet, X } from "lucide-react";
import {
  connectMeteorInApp,
  getAccountId,
  getModal,
  getSelector,
  isMeteorInAppBrowser,
  isMobileUa,
  tryOpenMeteorNativeApp,
  WC_PROJECT_ID,
} from "@/lib/near";
import "@near-wallet-selector/modal-ui/styles.css";

export function WalletButton({
  accountId,
  onChange,
}: {
  accountId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [inMeteor, setInMeteor] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    setInMeteor(isMeteorInAppBrowser());
    setMobile(isMobileUa());
    (async () => {
      try {
        const selector = await getSelector();
        const sync = async () => onChange(await getAccountId());
        await sync();

        // Inside Meteor's dApp browser: auto-sign-in via injected bridge.
        if (isMeteorInAppBrowser() && !selector.isSignedIn()) {
          try {
            const id = await connectMeteorInApp();
            onChange(id);
          } catch (e) {
            console.warn("Meteor In-App Auto-Connect Failed", e);
          }
        }

        unsub = selector.store.observable.subscribe(() => {
          void sync();
        }).unsubscribe;
        setReady(true);
      } catch (e) {
        console.error("Wallet Selector Init Failed", e);
        setReady(true);
      }
    })();
    return () => {
      unsub?.();
    };
  }, [onChange]);

  const connectDesktopOrModal = useCallback(async () => {
    const modal = await getModal();
    modal.show();
  }, []);

  const connect = useCallback(async () => {
    if (isMeteorInAppBrowser()) {
      setBusy(true);
      setHint(null);
      try {
        const id = await connectMeteorInApp();
        onChange(id);
      } catch (e) {
        setHint(
          e instanceof Error
            ? e.message
            : "Meteor In-App Connect Failed — Try The Wallet List"
        );
        await connectDesktopOrModal();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (isMobileUa()) {
      setSheetOpen(true);
      setHint(null);
      return;
    }

    await connectDesktopOrModal();
  }, [connectDesktopOrModal, onChange]);

  const openMeteorApp = useCallback(() => {
    const result = tryOpenMeteorNativeApp(window.location.href);
    setHint(
      result.attempted
        ? "Opening Meteor App… Then Open This Site In Its Built-In Browser And Tap Connect Again."
        : "Could Not Launch Meteor. Open The Meteor App → Browser → Paste This Site Url."
    );
  }, []);

  const connectViaWalletConnect = useCallback(async () => {
    setBusy(true);
    setHint(null);
    try {
      if (!WC_PROJECT_ID) {
        setHint(
          "WalletConnect Needs A Free Reown Project Id (NEXT_PUBLIC_WC_PROJECT_ID)."
        );
        setBusy(false);
        return;
      }
      const selector = await getSelector();
      const wallet = await selector.wallet("wallet-connect");
      // WalletConnect modal deep-links into installed wallets (incl. Meteor when listed).
      const contractId =
        process.env.NEXT_PUBLIC_NFT_CONTRACT || "perp-agent-nft.testnet";
      const accounts = await wallet.signIn({
        contractId,
      } as never);
      onChange(accounts[0]?.accountId ?? null);
      setSheetOpen(false);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "WalletConnect Failed");
      // Fall back to the full selector modal so other wallets still work.
      try {
        await connectDesktopOrModal();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }, [connectDesktopOrModal, onChange]);

  const disconnect = useCallback(async () => {
    const selector = await getSelector();
    const wallet = await selector.wallet();
    await wallet.signOut();
    onChange(null);
  }, [onChange]);

  if (!ready) {
    return <button className="btn-ghost px-3 py-2 text-xs opacity-60">Warming…</button>;
  }

  if (accountId) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="chip max-w-[140px] truncate normal-case tracking-normal text-brown-200 sm:max-w-[180px]">
          <Wallet size={11} />
          {accountId}
        </span>
        <button className="btn-ghost px-2.5 py-2 text-xs" onClick={disconnect} title="Sign Out">
          <LogOut size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="btn-primary px-3 py-2 text-xs sm:text-sm"
        onClick={connect}
        disabled={busy}
      >
        {mobile || inMeteor ? <Smartphone size={14} /> : <Wallet size={14} />}
        {busy ? "Connecting…" : inMeteor ? "Connect Meteor" : "Connect"}
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="panel w-full max-w-md border border-brown-700/50 bg-[#0b0d12] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base text-brown-100">Connect Meteor App</h3>
                <p className="mt-1 text-xs leading-relaxed text-brown-300/80">
                  Phone Connect Hands Off To The Meteor Wallet App — Not The Website.
                </p>
              </div>
              <button
                className="btn-ghost px-2 py-2"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button className="btn-primary w-full justify-center py-3 text-sm" onClick={openMeteorApp}>
                <Smartphone size={15} />
                Open Meteor App
              </button>

              {WC_PROJECT_ID ? (
                <button
                  className="btn-ghost w-full justify-center border border-brown-700/40 py-3 text-sm"
                  onClick={connectViaWalletConnect}
                  disabled={busy}
                >
                  <Wallet size={15} />
                  {busy ? "Waiting On Wallet…" : "WalletConnect → Meteor"}
                </button>
              ) : (
                <p className="rounded-md border border-brown-800/60 bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-brown-300/80">
                  WalletConnect Deep-Link Needs A Free Project Id From{" "}
                  <span className="text-brown-100">Dashboard.Reown.Com</span>. Set{" "}
                  <span className="font-mono text-brown-100">NEXT_PUBLIC_WC_PROJECT_ID</span> Then
                  Redeploy For One-Tap App Handoff.
                </p>
              )}

              <button
                className="btn-ghost w-full justify-center py-2.5 text-xs text-brown-300"
                onClick={async () => {
                  setSheetOpen(false);
                  await connectDesktopOrModal();
                }}
              >
                Other Wallets (Meteor Web / Mynearwallet)
              </button>
            </div>

            {hint && (
              <p className="mt-3 rounded-md border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
                {hint}
              </p>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-brown-400/80">
              Best Path Today: In Meteor, Open The Built-In Browser → Paste This Site → Tap Connect.
              The Injected Meteor Wallet App Module Auto-Hooks There.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
