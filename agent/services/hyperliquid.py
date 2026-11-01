"""Hyperliquid TESTNET order placement with TP/SL.

Never points at mainnet. Dry-run is the default unless HL_PRIVATE_KEY is set
and DRY_RUN=false.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from eth_account import Account

from agent.parsers.rules import ParsedOrder

logger = logging.getLogger(__name__)

TESTNET_API = "https://api.hyperliquid-testnet.xyz"
MAINNET_API = "https://api.hyperliquid.xyz"  # never used


class HyperliquidAgent:
    def __init__(
        self,
        private_key: Optional[str] = None,
        account_address: Optional[str] = None,
        dry_run: Optional[bool] = None,
    ) -> None:
        self.private_key = private_key or os.getenv("HL_PRIVATE_KEY") or os.getenv(
            "HL_TESTNET_PRIVATE_KEY"
        )
        self.account_address = account_address or os.getenv("HL_ACCOUNT_ADDRESS")
        env_dry = os.getenv("DRY_RUN", "true").lower() not in ("0", "false", "no")
        self.dry_run = env_dry if dry_run is None else dry_run
        # Safety: refuse mainnet URL
        self.api_url = TESTNET_API
        if os.getenv("HL_API_URL"):
            url = os.getenv("HL_API_URL", "")
            if "hyperliquid.xyz" in url and "testnet" not in url:
                raise RuntimeError("Refusing mainnet Hyperliquid URL — testnet only")
            if "testnet" in url:
                self.api_url = url

        self._exchange = None
        self._info = None
        if self.private_key and not self.dry_run:
            self._init_sdk()

    def _init_sdk(self) -> None:
        from hyperliquid.exchange import Exchange
        from hyperliquid.info import Info
        from hyperliquid.utils import constants

        assert constants.TESTNET_API_URL.endswith("testnet.xyz")
        wallet = Account.from_key(self.private_key)
        addr = self.account_address or wallet.address
        self.account_address = addr
        self._info = Info(constants.TESTNET_API_URL, skip_ws=True)
        self._exchange = Exchange(
            wallet, constants.TESTNET_API_URL, account_address=addr
        )
        logger.info("Hyperliquid testnet exchange ready for %s", addr)

    @property
    def mode(self) -> str:
        if self.dry_run or not self.private_key:
            return "dry_run"
        return "testnet_live"

    def wallet_address(self) -> Optional[str]:
        if self.account_address:
            return self.account_address
        if self.private_key:
            return Account.from_key(self.private_key).address
        return None

    def place_with_tpsl(
        self, order: ParsedOrder, size: Optional[float] = None
    ) -> dict[str, Any]:
        sz = size or order.size or float(os.getenv("DEFAULT_SIZE", "0.01"))
        is_buy = order.side == "long"
        coin = order.coin

        # Determine entry price for limit; for market use a sentinel aggressive px
        entry = order.entry
        plan = {
            "coin": coin,
            "side": order.side,
            "is_buy": is_buy,
            "size": sz,
            "entry": entry,
            "tp": order.tp,
            "sl": order.sl,
            "market": order.market,
            "raw": order.raw,
            "mode": self.mode,
            "api": self.api_url,
            "wallet": self.wallet_address(),
        }

        if self.mode == "dry_run":
            plan["status"] = "dry_run"
            plan["message"] = (
                "Parsed OK. No order sent (DRY_RUN). "
                "Set HL_PRIVATE_KEY + DRY_RUN=false to place on Hyperliquid testnet."
            )
            plan["would_submit"] = self._build_orders(order, sz, is_buy)
            return plan

        assert self._exchange is not None
        orders = self._build_orders(order, sz, is_buy)
        # Prefer grouped TP/SL when both present
        if order.tp is not None and order.sl is not None and entry is not None:
            resp = self._exchange.bulk_orders(orders, grouping="normalTpsl")
        elif entry is not None:
            # place entry then optional triggers separately
            resp = self._exchange.bulk_orders(orders, grouping="na")
        else:
            # market open then attach tp/sl as positionTpsl if possible
            px = self._aggressive_px(coin, is_buy)
            resp = self._exchange.market_open(coin, is_buy, sz, px)
            if order.tp is not None or order.sl is not None:
                triggers = []
                if order.tp is not None:
                    triggers.append(
                        {
                            "coin": coin,
                            "is_buy": not is_buy,
                            "sz": sz,
                            "limit_px": order.tp,
                            "order_type": {
                                "trigger": {
                                    "isMarket": True,
                                    "triggerPx": order.tp,
                                    "tpsl": "tp",
                                }
                            },
                            "reduce_only": True,
                        }
                    )
                if order.sl is not None:
                    triggers.append(
                        {
                            "coin": coin,
                            "is_buy": not is_buy,
                            "sz": sz,
                            "limit_px": order.sl,
                            "order_type": {
                                "trigger": {
                                    "isMarket": True,
                                    "triggerPx": order.sl,
                                    "tpsl": "sl",
                                }
                            },
                            "reduce_only": True,
                        }
                    )
                if triggers:
                    trig_resp = self._exchange.bulk_orders(
                        triggers, grouping="positionTpsl"
                    )
                    plan["trigger_response"] = trig_resp

        plan["status"] = "submitted"
        plan["response"] = resp
        plan["submitted_orders"] = orders
        return plan

    def _aggressive_px(self, coin: str, is_buy: bool) -> float:
        """Fetch mid and skew for IOC market-like fill on testnet."""
        from hyperliquid.utils import constants
        from hyperliquid.info import Info

        info = self._info or Info(constants.TESTNET_API_URL, skip_ws=True)
        mids = info.all_mids()
        mid = float(mids.get(coin, 0) or 0)
        if mid <= 0:
            raise RuntimeError(f"no mid price for {coin} on testnet")
        return mid * (1.05 if is_buy else 0.95)

    def _build_orders(
        self, order: ParsedOrder, sz: float, is_buy: bool
    ) -> list[dict[str, Any]]:
        coin = order.coin
        entry = order.entry
        orders: list[dict[str, Any]] = []

        if entry is not None:
            orders.append(
                {
                    "coin": coin,
                    "is_buy": is_buy,
                    "sz": sz,
                    "limit_px": entry,
                    "order_type": {"limit": {"tif": "Gtc"}},
                    "reduce_only": False,
                }
            )
            if order.tp is not None:
                orders.append(
                    {
                        "coin": coin,
                        "is_buy": not is_buy,
                        "sz": sz,
                        "limit_px": order.tp,
                        "order_type": {
                            "trigger": {
                                "isMarket": True,
                                "triggerPx": order.tp,
                                "tpsl": "tp",
                            }
                        },
                        "reduce_only": True,
                    }
                )
            if order.sl is not None:
                orders.append(
                    {
                        "coin": coin,
                        "is_buy": not is_buy,
                        "sz": sz,
                        "limit_px": order.sl,
                        "order_type": {
                            "trigger": {
                                "isMarket": True,
                                "triggerPx": order.sl,
                                "tpsl": "sl",
                            }
                        },
                        "reduce_only": True,
                    }
                )
        return orders

    def user_state(self) -> dict[str, Any]:
        if not self.wallet_address():
            return {"error": "no wallet"}
        from hyperliquid.info import Info
        from hyperliquid.utils import constants

        info = self._info or Info(constants.TESTNET_API_URL, skip_ws=True)
        return info.user_state(self.wallet_address())


def generate_testnet_wallet() -> dict[str, str]:
    """Create a fresh throwaway EVM key for Hyperliquid testnet demos."""
    acct = Account.create()
    return {"address": acct.address, "private_key": acct.key.hex()}
