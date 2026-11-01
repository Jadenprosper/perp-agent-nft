"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import { getAccountId, getModal, getSelector } from "@/lib/near";
import "@near-wallet-selector/modal-ui/styles.css";

export function WalletButton({
  accountId,
  onChange,
}: {
  accountId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const selector = await getSelector();
        const sync = async () => onChange(await getAccountId());
        await sync();
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

  const connect = useCallback(async () => {
    const modal = await getModal();
    modal.show();
  }, []);

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
    <button className="btn-primary px-3 py-2 text-xs sm:text-sm" onClick={connect}>
      <Wallet size={14} />
      Connect
    </button>
  );
}
