"""Perp Agent NFT — FastAPI backend.

Serves the trading agent that is gated by NFT ownership.
Default mode: local demo store + Hyperliquid TESTNET dry-run.
First drop: max 100 agents, one mint per wallet.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agent.parsers.rules import ParseError, parse_rules  # noqa: E402
from agent.services.hyperliquid import HyperliquidAgent, generate_testnet_wallet  # noqa: E402
from agent.services.store import STORE  # noqa: E402
from agent.services.traits import AgentTraits, svg_portrait  # noqa: E402

app = FastAPI(
    title="Perp Agent NFT",
    description="An NFT that IS a Hyperliquid perp trading agent. Testnet only. First drop: 100.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

hl = HyperliquidAgent()


class MintBody(BaseModel):
    owner_id: str = Field(..., min_length=2, max_length=64)
    title: Optional[str] = None
    rules: str = ""
    max_size: str = "0.01"
    token_id: Optional[int] = Field(default=None, ge=1, le=100)


class RulesBody(BaseModel):
    caller: str
    rules: str
    max_size: Optional[str] = None
    status: Optional[str] = None


class TransferBody(BaseModel):
    caller: str
    receiver_id: str


class ExecuteBody(BaseModel):
    caller: str
    size: Optional[float] = None
    dry_run: Optional[bool] = None


class ParseBody(BaseModel):
    text: str


@app.get("/api/health")
def health() -> dict[str, Any]:
    stats = STORE.mint_stats()
    return {
        "ok": True,
        "mode": hl.mode,
        "hl_api": hl.api_url,
        "wallet": hl.wallet_address(),
        "vibe": "the agent is caffeinated and looking at charts",
        "mint": stats,
    }


@app.get("/api/mint-stats")
def mint_stats() -> dict[str, Any]:
    """Live first-drop counter: minted / 100."""
    stats = STORE.mint_stats()
    stats["minted_ids"] = STORE.minted_ids()
    return stats


@app.get("/api/minted-ids")
def minted_ids() -> dict[str, Any]:
    """Token ids already hired (for the picker Taken badges)."""
    return {"minted_ids": STORE.minted_ids(), **STORE.mint_stats()}


@app.post("/api/parse")
def api_parse(body: ParseBody) -> dict[str, Any]:
    try:
        order = parse_rules(body.text)
    except ParseError as e:
        raise HTTPException(400, detail=str(e)) from e
    return {"ok": True, "order": order.to_dict()}


@app.get("/api/nfts")
def list_nfts(owner: Optional[str] = None) -> dict[str, Any]:
    nfts = STORE.list_for_owner(owner) if owner else STORE.list_all()
    return {"nfts": [STORE.to_public(n) for n in nfts], "mint": STORE.mint_stats()}


@app.get("/api/nfts/{token_id}")
def get_nft(token_id: str) -> dict[str, Any]:
    nft = STORE.get(token_id)
    if not nft:
        raise HTTPException(404, detail="that agent ghosted — token not found")
    return STORE.to_public(nft)


@app.get("/api/nfts/{token_id}/portrait.svg")
def portrait_svg(token_id: str) -> Response:
    nft = STORE.get(token_id)
    if not nft:
        raise HTTPException(404, detail="token not found")
    traits = nft.config.traits or {}
    t = AgentTraits(
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
    return Response(content=svg_portrait(t), media_type="image/svg+xml")


@app.post("/api/nfts/mint")
def mint_nft(body: MintBody) -> dict[str, Any]:
    try:
        nft = STORE.mint(
            owner_id=body.owner_id,
            rules=body.rules,
            max_size=body.max_size,
            title=body.title,
            token_id=body.token_id,
        )
    except PermissionError as e:
        raise HTTPException(403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, detail=str(e)) from e
    return {
        "ok": True,
        "nft": STORE.to_public(nft),
        "mint": STORE.mint_stats(),
        "toast": f"{nft.title} just clocked in ⚡ ({STORE.mint_stats()['minted']}/100)",
    }


@app.post("/api/nfts/{token_id}/rules")
def set_rules(token_id: str, body: RulesBody) -> dict[str, Any]:
    try:
        nft = STORE.set_rules(token_id, body.caller, body.rules, body.max_size, body.status)
    except KeyError as e:
        raise HTTPException(404, detail="token not found") from e
    except PermissionError as e:
        raise HTTPException(403, detail=str(e)) from e
    parsed = None
    parse_err = None
    if body.rules.strip():
        try:
            parsed = parse_rules(body.rules).to_dict()
        except ParseError as e:
            parse_err = str(e)
    return {
        "ok": True,
        "nft": STORE.to_public(nft),
        "parsed": parsed,
        "parse_error": parse_err,
    }


@app.post("/api/nfts/{token_id}/transfer")
def transfer_nft(token_id: str, body: TransferBody) -> dict[str, Any]:
    try:
        nft = STORE.transfer(token_id, body.caller, body.receiver_id)
    except KeyError as e:
        raise HTTPException(404, detail="token not found") from e
    except PermissionError as e:
        raise HTTPException(403, detail=str(e)) from e
    return {
        "ok": True,
        "nft": STORE.to_public(nft),
        "toast": "ownership yeeted — new holder runs the desk now",
    }


@app.post("/api/nfts/{token_id}/execute")
def execute(token_id: str, body: ExecuteBody) -> dict[str, Any]:
    nft = STORE.get(token_id)
    if not nft:
        raise HTTPException(404, detail="token not found")
    if nft.owner_id != body.caller:
        raise HTTPException(403, detail="Only the NFT owner can fire this agent")
    if not nft.config.rules.strip():
        raise HTTPException(400, detail="agent has no rules — teach it a trade first")
    if nft.config.status == "paused":
        raise HTTPException(400, detail="agent is on pause (touch grass mode)")

    try:
        order = parse_rules(nft.config.rules)
    except ParseError as e:
        raise HTTPException(400, detail=f"rules don't parse: {e}") from e

    max_sz = float(nft.config.max_size or "0.01")
    size = body.size or order.size or max_sz
    if size > max_sz:
        size = max_sz

    agent = hl
    if body.dry_run is not None:
        agent = HyperliquidAgent(dry_run=body.dry_run)

    result = agent.place_with_tpsl(order, size=size)
    detail = (
        f"{order.side} {order.coin} sz={size} entry={order.entry} "
        f"tp={order.tp} sl={order.sl} mode={result.get('mode')}"
    )
    # silly performance nudge for mood art
    delta = 50 if result.get("mode") == "dry_run" else 0
    STORE.record_action(token_id, body.caller, detail, performance_delta_bps=delta)
    nft = STORE.get(token_id)
    return {
        "ok": True,
        "result": result,
        "nft": STORE.to_public(nft) if nft else None,
        "toast": "order ticket stamped — may the funding be ever in your favor",
    }


@app.post("/api/wallet/generate")
def gen_wallet() -> dict[str, Any]:
    """Throwaway Hyperliquid TESTNET key. Never use on mainnet."""
    w = generate_testnet_wallet()
    return {
        "ok": True,
        "address": w["address"],
        "private_key": w["private_key"],
        "warning": "TESTNET ONLY. Fund via Hyperliquid testnet faucet. Do not reuse on mainnet.",
    }


@app.get("/api/hl/state")
def hl_state() -> dict[str, Any]:
    if hl.mode == "dry_run" and not hl.wallet_address():
        return {"mode": "dry_run", "message": "no wallet bound — dry run only"}
    try:
        return {"mode": hl.mode, "state": hl.user_state()}
    except Exception as e:  # noqa: BLE001
        return {"mode": hl.mode, "error": str(e)}


WEB_OUT = ROOT / "web" / "out"
if WEB_OUT.exists():
    app.mount("/assets", StaticFiles(directory=WEB_OUT / "_next"), name="next_static")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_OUT / "index.html")


def main() -> None:
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8787"))
    uvicorn.run("agent.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
