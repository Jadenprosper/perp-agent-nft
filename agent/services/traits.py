"""Offline trait generation mirroring the on-chain mint logic."""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass

TITLES = [
    "Captain Stop-Loss",
    "Lord Leverage",
    "Dame Liquidation",
    "Sir Scalp-a-Lot",
    "Funding Fiona",
    "Margin Marty",
    "The Bid Whisperer",
    "Duke of Drawdown",
    "Baron Break-Even",
    "Queen of Quicksilver",
    "Professor Take-Profit",
    "Count Candlewick",
    "Lady Limit-Order",
    "General Gridlock",
    "Oracle Ollie",
    "Volatility Vince",
    "Miss Mark-to-Market",
    "Chief Chart Goblin",
    "Senpai Short-Squeeze",
    "Auntie Alpha",
]
HELMS = ["neon visor", "tinfoil crown", "pilot goggles", "degen bandana", "laser monocle", "chart-print beanie"]
BODIES = ["chrome chassis", "matte void suit", "pastel armor", "circuit kimono", "carbon trench", "hologram hoodie"]
GEAR = ["TP/SL twin pistols", "funding-rate abacus", "liquidation lasso", "orderbook shield", "candle stick", "risk slider wand"]
AURAS = ["mint glow", "pink panic haze", "violet calm", "amber tilt", "lime degen blaze", "ice-cold blue"]
CATCHPHRASES = [
    "size responsibly or i riot",
    "i only long my own bags",
    "stop-loss is a love language",
    "funding paid my rent",
    "charts lied, i believed",
    "paper hands fear me",
]

MOOD_COLORS = {
    "hyped": "#00d4aa",
    "locked_in": "#b8ff3c",
    "tilt": "#ffb020",
    "rugged": "#ff4d9a",
    "zen": "#8b5cff",
}


@dataclass
class AgentTraits:
    name: str
    helm: str
    body: str
    gear: str
    aura: str
    catchphrase: str
    seed: int
    mood: str = "locked_in"
    performance_bps: int = 0

    def to_dict(self):
        return asdict(self)


def mood_from_perf(bps: int) -> str:
    if bps >= 500:
        return "hyped"
    if bps >= 100:
        return "locked_in"
    if bps <= -500:
        return "rugged"
    if bps <= -100:
        return "tilt"
    return "zen"


def generate_traits(seed: int | None = None) -> AgentTraits:
    seed = seed if seed is not None else random.randint(1, 2**31 - 1)
    rng = random.Random(seed)
    return AgentTraits(
        name=rng.choice(TITLES),
        helm=rng.choice(HELMS),
        body=rng.choice(BODIES),
        gear=rng.choice(GEAR),
        aura=rng.choice(AURAS),
        catchphrase=rng.choice(CATCHPHRASES),
        seed=seed,
        mood="locked_in",
        performance_bps=0,
    )


def svg_portrait(t: AgentTraits) -> str:
    c = MOOD_COLORS.get(t.mood, "#8b5cff")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="{c}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#05070b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" rx="40" fill="#0b0f14"/>
  <rect width="400" height="400" rx="40" fill="url(#g)"/>
  <rect x="130" y="100" width="140" height="120" rx="28" fill="#121821" stroke="{c}" stroke-width="4"/>
  <circle cx="170" cy="145" r="12" fill="{c}"/>
  <circle cx="230" cy="145" r="12" fill="{c}"/>
  <rect x="170" y="175" width="60" height="10" rx="5" fill="{c}"/>
  <rect x="155" y="230" width="90" height="70" rx="16" fill="#1a2330" stroke="{c}" stroke-width="2"/>
  <text x="200" y="330" text-anchor="middle" font-family="ui-monospace,monospace" font-size="18" fill="{c}">{t.name}</text>
  <text x="200" y="358" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="#ffffff99">{t.mood} · {t.helm}</text>
</svg>"""


# Paper-bag PFP catalog (token id 1..100 -> /agents/{id}.jpg)
from pathlib import Path as _Path
import json as _json

_CATALOG_PATH = _Path(__file__).resolve().parents[2] / "web" / "public" / "agents" / "metadata.json"
_CATALOG: dict[int, dict] | None = None


def _catalog_items(raw) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("agents", "items", "nfts", "collection"):
            if isinstance(raw.get(key), list):
                return raw[key]
    return []


def load_agent_catalog() -> dict[int, dict]:
    global _CATALOG
    if _CATALOG is not None:
        return _CATALOG
    _CATALOG = {}
    if _CATALOG_PATH.exists():
        raw = _json.loads(_CATALOG_PATH.read_text())
        for item in _catalog_items(raw):
            if not isinstance(item, dict):
                continue
            tid = item.get("id", item.get("token_id"))
            try:
                _CATALOG[int(tid)] = item
            except (TypeError, ValueError):
                continue
    return _CATALOG


def traits_for_token(token_num: int, seed: int | None = None) -> AgentTraits:
    """Prefer curated PFP catalog entry for token N; fall back to random.

    Trait key names in metadata.json may change (eyewear/accessory/held/…).
    Map generically onto the on-chain-shaped AgentTraits fields.
    """
    catalog = load_agent_catalog()
    entry = catalog.get(token_num)
    base = generate_traits(seed=seed if seed is not None else token_num * 7919)
    if not entry:
        return base
    t = entry.get("traits") or {}
    base.name = entry.get("name") or base.name
    # Prefer whatever the catalog currently uses; fall back across aliases.
    base.helm = (
        t.get("eyewear")
        or t.get("headgear")
        or t.get("glasses")
        or t.get("helm")
        or base.helm
    )
    base.body = t.get("outfit") or t.get("body") or t.get("fit") or base.body
    base.gear = (
        t.get("accessory")
        or t.get("held")
        or t.get("gear")
        or t.get("glasses")
        or base.gear
    )
    base.aura = t.get("background") or t.get("aura") or t.get("bag") or base.aura
    return base


def catalog_image_path(token_num: int) -> str:
    return f"/agents/{token_num}.jpg"
