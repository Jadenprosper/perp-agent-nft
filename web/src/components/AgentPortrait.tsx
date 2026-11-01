"use client";

import type { Nft } from "@/lib/api";

const moodRing: Record<string, string> = {
  hyped: "from-neon-mint/40 to-neon-lime/20",
  locked_in: "from-neon-lime/35 to-neon-mint/15",
  tilt: "from-neon-amber/40 to-neon-pink/15",
  rugged: "from-neon-pink/45 to-neon-violet/20",
  zen: "from-neon-violet/40 to-neon-mint/10",
};

export function AgentPortrait({
  nft,
  size = 96,
  className = "",
}: {
  nft: Nft;
  size?: number;
  className?: string;
}) {
  const traits = (nft.config.traits || {}) as Record<string, unknown>;
  const mood = String(traits.mood || "zen");
  const svg = nft.portrait_svg;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${
        moodRing[mood] || moodRing.zen
      } ${className}`}
      style={{ width: size, height: size }}
      title={`${nft.title} · ${mood}`}
    >
      {svg ? (
        <div
          className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/nfts/${nft.token_id}/portrait.svg`}
          alt={nft.title}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
