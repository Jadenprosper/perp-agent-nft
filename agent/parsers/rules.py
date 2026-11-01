"""LLM-free natural-language trade rule parser.

Examples:
  long ETH at 3200, TP 3500, SL 3100
  short BTC size 0.01 tp 95000 sl 102000
  buy 0.05 SOL at market, take profit 220, stop 180
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Optional


COINS = {
    "eth": "ETH",
    "ethereum": "ETH",
    "btc": "BTC",
    "bitcoin": "BTC",
    "sol": "SOL",
    "solana": "SOL",
    "arb": "ARB",
    "op": "OP",
    "doge": "DOGE",
    "bnb": "BNB",
    "avax": "AVAX",
    "link": "LINK",
    "sui": "SUI",
    "apt": "APT",
    "tia": "TIA",
    "sei": "SEI",
    "pepe": "kPEPE",
    "kpepe": "kPEPE",
    "wiff": "WIF",
    "wif": "WIF",
    "hype": "HYPE",
}


@dataclass
class ParsedOrder:
    side: str  # "long" | "short"
    coin: str
    entry: Optional[float]
    tp: Optional[float]
    sl: Optional[float]
    size: Optional[float]
    market: bool
    raw: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ParseError(ValueError):
    pass


_NUM = r"([0-9]+(?:\.[0-9]+)?)"


def parse_rules(text: str) -> ParsedOrder:
    if not text or not text.strip():
        raise ParseError("empty rules")

    raw = text.strip()
    lower = raw.lower()

    # side
    side: Optional[str] = None
    if re.search(r"\b(long|buy|longing)\b", lower):
        side = "long"
    elif re.search(r"\b(short|sell|shorting)\b", lower):
        side = "short"
    if side is None:
        raise ParseError("could not find side (long/short/buy/sell)")

    # coin
    coin: Optional[str] = None
    # prefer explicit tickers after side words
    for key, ticker in sorted(COINS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(key)}\b", lower):
            coin = ticker
            break
    if coin is None:
        # bare ticker like ETH/BTC
        m = re.search(r"\b([A-Z]{2,6})\b", raw)
        if m:
            coin = m.group(1).upper()
    if coin is None:
        raise ParseError("could not find coin (e.g. ETH, BTC, SOL)")

    market = bool(re.search(r"\b(market|mkt)\b", lower))

    entry = _find_price(
        lower,
        [
            rf"\bat\s*{_NUM}",
            rf"\bentry\s*(?:at\s*)?{_NUM}",
            rf"\blimit\s*(?:at\s*)?{_NUM}",
            rf"\bprice\s*(?:at\s*)?{_NUM}",
        ],
    )
    if entry is None and not market:
        # "long ETH 3200" pattern: number right after coin
        m = re.search(
            rf"\b{re.escape(coin.lower())}\b\s+(?:at\s+)?{_NUM}",
            lower,
        )
        if m:
            entry = float(m.group(1))

    tp = _find_price(
        lower,
        [
            rf"\btp\s*(?:at\s*)?{_NUM}",
            rf"\btake\s*profit\s*(?:at\s*)?{_NUM}",
            rf"\btarget\s*(?:at\s*)?{_NUM}",
        ],
    )
    sl = _find_price(
        lower,
        [
            rf"\bsl\s*(?:at\s*)?{_NUM}",
            rf"\bstop(?:\s*loss)?\s*(?:at\s*)?{_NUM}",
        ],
    )

    size = _find_price(
        lower,
        [
            rf"\bsize\s*(?:of\s*)?{_NUM}",
            rf"\bqty\s*{_NUM}",
            rf"\bamount\s*{_NUM}",
            rf"\b{_NUM}\s*(?:eth|btc|sol|arb|op|bnb|avax|link|sui|apt|tia|sei|hype)\b",
        ],
    )

    # sanity: for long, tp > entry > sl when all present
    if side == "long" and entry and tp and tp <= entry:
        raise ParseError(f"long TP ({tp}) must be above entry ({entry})")
    if side == "long" and entry and sl and sl >= entry:
        raise ParseError(f"long SL ({sl}) must be below entry ({entry})")
    if side == "short" and entry and tp and tp >= entry:
        raise ParseError(f"short TP ({tp}) must be below entry ({entry})")
    if side == "short" and entry and sl and sl <= entry:
        raise ParseError(f"short SL ({sl}) must be above entry ({entry})")

    return ParsedOrder(
        side=side,
        coin=coin,
        entry=entry,
        tp=tp,
        sl=sl,
        size=size,
        market=market or entry is None,
        raw=raw,
    )


def _find_price(text: str, patterns: list[str]) -> Optional[float]:
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return float(m.group(1))
    return None
