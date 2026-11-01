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
        console.error("wallet selector init failed", e);
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
    return <button className="btn-ghost text-xs opacity-60">warming wallets…</button>;
  }

  if (accountId) {
    return (
      <div className="flex items-center gap-2">
        <span className="chip max-w-[160px] truncate font-mono text-neon-mint">
          <Wallet size={12} />
          {accountId}
        </span>
        <button className="btn-ghost px-3 py-2 text-xs" onClick={disconnect} title="sign out">
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <button className="btn-primary text-xs sm:text-sm" onClick={connect}>
      <Wallet size={16} />
      connect NEAR
    </button>
  );
}
