"""Local agent NFT store — mirrors on-chain first-drop rules for demo mode.

- max supply 100
- one mint per wallet
- unique generated traits/art
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

from .traits import AgentTraits, generate_traits, mood_from_perf, svg_portrait, traits_for_token, catalog_image_path, load_agent_catalog

DATA_PATH = Path(__file__).resolve().parents[2] / "demo" / "local_nfts.json"
MAX_SUPPLY = 100


@dataclass
class AgentConfig:
    rules: str = ""
    status: str = "idle"
    hl_account: Optional[str] = None
    max_size: str = "0.01"
    last_action: Optional[str] = None
    updated_at: int = 0
    traits: dict = field(default_factory=dict)


@dataclass
class AgentEvent:
    at: int
    kind: str
    detail: str
    by: str


@dataclass
class LocalNFT:
    token_id: str
    owner_id: str
    title: str
    description: str
    config: AgentConfig = field(default_factory=AgentConfig)
    history: list[AgentEvent] = field(default_factory=list)
    minter_id: str = ""


class LocalStore:
    def __init__(self, path: Path = DATA_PATH, max_supply: int = MAX_SUPPLY) -> None:
        self.path = path
        self.max_supply = max_supply
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._nfts: dict[str, LocalNFT] = {}
        self._minted_by: dict[str, str] = {}  # account -> token_id (first-drop mint)
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text())
        self.max_supply = int(raw.get("max_supply", MAX_SUPPLY))
        for item in raw.get("nfts", []):
            cfg_raw = item.get("config", {})
            cfg = AgentConfig(
                rules=cfg_raw.get("rules", ""),
                status=cfg_raw.get("status", "idle"),
                hl_account=cfg_raw.get("hl_account"),
                max_size=cfg_raw.get("max_size", "0.01"),
                last_action=cfg_raw.get("last_action"),
                updated_at=cfg_raw.get("updated_at", 0),
                traits=cfg_raw.get("traits") or {},
            )
            hist = [AgentEvent(**h) for h in item.get("history", [])]
            nft = LocalNFT(
                token_id=item["token_id"],
                owner_id=item["owner_id"],
                title=item.get("title", f"Perp Agent #{item['token_id']}"),
                description=item.get("description", ""),
                config=cfg,
                history=hist,
                minter_id=item.get("minter_id") or item["owner_id"],
            )
            self._nfts[nft.token_id] = nft
        self._minted_by = dict(raw.get("minted_by", {}))
        if not self._minted_by:
            for n in self._nfts.values():
                self._minted_by.setdefault(n.minter_id or n.owner_id, n.token_id)

    def _save(self) -> None:
        payload = {
            "max_supply": self.max_supply,
            "minted_by": self._minted_by,
            "nfts": [
                {
                    "token_id": n.token_id,
                    "owner_id": n.owner_id,
                    "minter_id": n.minter_id,
                    "title": n.title,
                    "description": n.description,
                    "config": asdict(n.config),
                    "history": [asdict(h) for h in n.history],
                }
                for n in self._nfts.values()
            ],
        }
        self.path.write_text(json.dumps(payload, indent=2))

    def mint_stats(self) -> dict[str, Any]:
        minted = len(self._nfts)
        remaining = max(0, self.max_supply - minted)
        return {
            "minted": minted,
            "max_supply": self.max_supply,
            "remaining": remaining,
            "sold_out": minted >= self.max_supply,
        }

    def agent_of(self, account_id: str) -> Optional[LocalNFT]:
        # Prefer currently held NFT for this wallet (token-gate)
        held = [n for n in self._nfts.values() if n.owner_id == account_id]
        if held:
            return held[0]
        return None

    def mint(
        self,
        owner_id: str,
        rules: str = "",
        max_size: str = "0.01",
        title: Optional[str] = None,  # ignored — traits name wins
    ) -> LocalNFT:
        with self._lock:
            stats = self.mint_stats()
            if stats["sold_out"]:
                raise RuntimeError(
                    "sold out — the first 100 agents already clocked in. catch a transfer if you can."
                )
            if owner_id in self._minted_by:
                raise PermissionError(
                    "one agent per wallet — you already hired yours. transfer it if you want a different vibe."
                )
            # also block if they currently hold one (received via transfer)
            if any(n.owner_id == owner_id for n in self._nfts.values()):
                raise PermissionError(
                    "you already hold an agent NFT — one desk per wallet. transfer first if you're swapping mains."
                )

            token_num = len(self._nfts) + 1  # 1..100 maps to /agents/{n}.jpg
            token_id = str(token_num)
            now = int(time.time() * 1000)
            traits = traits_for_token(token_num, seed=now ^ (token_num * 7919))
            catalog = load_agent_catalog().get(token_num) or {}
            bag = (catalog.get("traits") or {}).get("bag", "")
            tdict = traits.to_dict()
            tdict["bag"] = bag
            tdict["image"] = catalog_image_path(token_num)
            tdict["headgear"] = (catalog.get("traits") or {}).get("headgear", traits.helm)
            tdict["glasses"] = (catalog.get("traits") or {}).get("glasses", traits.gear)
            tdict["outfit"] = (catalog.get("traits") or {}).get("outfit", traits.body)
            tdict["background"] = (catalog.get("traits") or {}).get("background", traits.aura)
            cfg = AgentConfig(
                rules=rules,
                status="armed" if rules else "idle",
                max_size=max_size,
                updated_at=now,
                traits=tdict,
            )
            nft = LocalNFT(
                token_id=token_id,
                owner_id=owner_id,
                minter_id=owner_id,
                title=traits.name,
                description=f'Perp trading agent. "{traits.catchphrase}"',
                config=cfg,
                history=[
                    AgentEvent(
                        at=now,
                        kind="mint",
                        detail=f"{traits.name} hired by {owner_id}",
                        by=owner_id,
                    )
                ],
            )
            self._nfts[token_id] = nft
            self._minted_by[owner_id] = token_id
            self._save()
            return nft

    def get(self, token_id: str) -> Optional[LocalNFT]:
        return self._nfts.get(token_id)

    def list_all(self) -> list[LocalNFT]:
        return list(self._nfts.values())

    def list_for_owner(self, owner_id: str) -> list[LocalNFT]:
        return [n for n in self._nfts.values() if n.owner_id == owner_id]

    def require_owner(self, token_id: str, caller: str) -> LocalNFT:
        nft = self._nfts.get(token_id)
        if not nft:
            raise KeyError("token not found")
        if nft.owner_id != caller:
            raise PermissionError("Only the NFT owner can control this agent")
        return nft

    def set_rules(
        self,
        token_id: str,
        caller: str,
        rules: str,
        max_size: Optional[str] = None,
        status: Optional[str] = None,
    ) -> LocalNFT:
        with self._lock:
            nft = self.require_owner(token_id, caller)
            nft.config.rules = rules
            if max_size is not None:
                nft.config.max_size = max_size
            if status is not None:
                nft.config.status = status
            elif rules and nft.config.status == "idle":
                nft.config.status = "armed"
            nft.config.updated_at = int(time.time() * 1000)
            nft.history.append(
                AgentEvent(at=nft.config.updated_at, kind="set_rules", detail=rules, by=caller)
            )
            nft.history = nft.history[-32:]
            self._save()
            return nft

    def transfer(self, token_id: str, caller: str, receiver_id: str) -> LocalNFT:
        with self._lock:
            nft = self.require_owner(token_id, caller)
            if any(n.owner_id == receiver_id for n in self._nfts.values()):
                raise PermissionError(
                    "receiver already holds an agent — one desk per wallet on this drop."
                )
            prev = nft.owner_id
            nft.owner_id = receiver_id
            now = int(time.time() * 1000)
            nft.history.append(
                AgentEvent(at=now, kind="transfer", detail=f"{prev} -> {receiver_id}", by=prev)
            )
            nft.history = nft.history[-32:]
            self._save()
            return nft

    def record_action(
        self,
        token_id: str,
        caller: str,
        detail: str,
        performance_delta_bps: int = 0,
    ) -> LocalNFT:
        with self._lock:
            nft = self.require_owner(token_id, caller)
            now = int(time.time() * 1000)
            nft.config.last_action = detail
            nft.config.status = "active"
            nft.config.updated_at = now
            traits = dict(nft.config.traits or {})
            perf = int(traits.get("performance_bps") or 0) + performance_delta_bps
            traits["performance_bps"] = perf
            traits["mood"] = mood_from_perf(perf)
            nft.config.traits = traits
            nft.history.append(AgentEvent(at=now, kind="action", detail=detail, by=caller))
            nft.history = nft.history[-32:]
            self._save()
            return nft

    def to_public(self, nft: LocalNFT) -> dict[str, Any]:
        traits = nft.config.traits or {}
        t_obj = AgentTraits(
            name=traits.get("name") or nft.title,
            helm=traits.get("helm", ""),
            body=traits.get("body", ""),
            gear=traits.get("gear", ""),
            aura=traits.get("aura", ""),
            catchphrase=traits.get("catchphrase", ""),
            seed=int(traits.get("seed") or 0),
            mood=traits.get("mood", "zen"),
            performance_bps=int(traits.get("performance_bps") or 0),
        )
        try:
            token_num = int(nft.token_id)
        except ValueError:
            token_num = 0
        portrait_url = (traits.get("image") if isinstance(traits, dict) else None) or (
            catalog_image_path(token_num) if token_num else None
        )
        return {
            "token_id": nft.token_id,
            "owner_id": nft.owner_id,
            "minter_id": nft.minter_id,
            "title": nft.title,
            "description": nft.description,
            "config": asdict(nft.config),
            "history": [asdict(h) for h in nft.history],
            "portrait_svg": svg_portrait(t_obj),
            "portrait_url": portrait_url,
        }


STORE = LocalStore()
