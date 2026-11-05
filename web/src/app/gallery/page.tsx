import type { Metadata } from "next";
import items from "@/lib/gallery.json";

export const metadata: Metadata = { title: "Gallery · Bag Worker" };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function GalleryPage() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] overflow-x-hidden px-3 pb-16 sm:px-4">
      <header className="sticky top-0 z-40 -mx-3 mb-4 flex items-center gap-3 border-b border-brown-400/15 bg-ink-950/92 px-3 py-2.5 backdrop-blur-xl sm:-mx-4 sm:px-4">
        <a href={`${BASE}/`} className="relative flex items-baseline gap-0.5 pb-1.5">
          <span className="font-display text-lg font-semibold tracking-tight text-cream sm:text-xl">Bag Worker</span>
          <span className="cursor-blink font-mono text-brown-400">_</span>
          <span className="brand-line" aria-hidden />
        </a>
        <a href={`${BASE}/`} className="btn-bracket ml-auto px-2 py-1.5 text-xs">
          Back To App
        </a>
      </header>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-cream sm:text-3xl">The Gallery</h1>
        <p className="mt-1 text-sm text-cream-mute">All 100 Bag Workers · One Per Wallet · Free Mint On NEAR Testnet</p>
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((it) => (
          <li key={it.id} className="panel min-w-0 overflow-hidden rounded-xl">
            <img
              src={`${BASE}/${it.img}`}
              alt={it.name}
              width={512}
              height={512}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full bg-ink-900 object-cover"
            />
            <div className="p-2.5 sm:p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="truncate font-display text-sm font-semibold text-cream">{it.name}</h2>
                <span className="font-mono text-[10px] text-brown-400">#{String(it.id).padStart(3, "0")}</span>
              </div>
              <p className="mt-1 break-words text-[11px] leading-snug text-cream-mute sm:text-xs">{it.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
