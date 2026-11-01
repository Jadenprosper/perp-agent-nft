from fastapi.testclient import TestClient

from agent.main import app
from agent.services.store import STORE, MAX_SUPPLY

client = TestClient(app)


def setup_function():
    STORE._nfts.clear()
    STORE._minted_by.clear()
    STORE.max_supply = MAX_SUPPLY
    if STORE.path.exists():
        STORE.path.unlink()


def test_health_and_mint_stats():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    s = client.get("/api/mint-stats").json()
    assert s["max_supply"] == 100
    assert s["minted"] == 0
    assert s["sold_out"] is False


def test_mint_set_execute_dry():
    r = client.post(
        "/api/nfts/mint",
        json={
            "owner_id": "didi.testnet",
            "rules": "long ETH at 3200, TP 3500, SL 3100",
            "title": "ignored-traits-win",
        },
    )
    assert r.status_code == 200
    body = r.json()
    token_id = body["nft"]["token_id"]
    assert body["nft"]["config"]["traits"]["name"]
    assert body["mint"]["minted"] == 1
    assert "portrait_svg" in body["nft"]

    # one per wallet
    r2 = client.post("/api/nfts/mint", json={"owner_id": "didi.testnet", "rules": ""})
    assert r2.status_code == 403

    r = client.post(
        f"/api/nfts/{token_id}/execute",
        json={"caller": "didi.testnet", "dry_run": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["result"]["mode"] == "dry_run"
    assert body["result"]["coin"] == "ETH"
    assert body["nft"]["config"]["traits"]["mood"]


def test_transfer_gates_control():
    r = client.post(
        "/api/nfts/mint",
        json={"owner_id": "alice.testnet", "rules": "short BTC at 100000, TP 95000, SL 102000"},
    )
    token_id = r.json()["nft"]["token_id"]
    client.post(
        f"/api/nfts/{token_id}/transfer",
        json={"caller": "alice.testnet", "receiver_id": "bob.testnet"},
    )
    r = client.post(
        f"/api/nfts/{token_id}/execute",
        json={"caller": "alice.testnet", "dry_run": True},
    )
    assert r.status_code == 403


def test_sold_out_at_100():
    STORE.max_supply = 2
    assert client.post("/api/nfts/mint", json={"owner_id": "a.testnet"}).status_code == 200
    assert client.post("/api/nfts/mint", json={"owner_id": "b.testnet"}).status_code == 200
    r = client.post("/api/nfts/mint", json={"owner_id": "c.testnet"})
    assert r.status_code == 409
    assert "sold out" in r.json()["detail"].lower()
    assert client.get("/api/mint-stats").json()["sold_out"] is True


def test_mint_chosen_token_id():
    r = client.post(
        "/api/nfts/mint",
        json={"owner_id": "picker.testnet", "token_id": 42, "rules": "long SOL"},
    )
    assert r.status_code == 200
    assert r.json()["nft"]["token_id"] == "42"
    # taken
    r2 = client.post(
        "/api/nfts/mint",
        json={"owner_id": "other.testnet", "token_id": 42},
    )
    assert r2.status_code == 409
    # out of range
    r3 = client.post(
        "/api/nfts/mint",
        json={"owner_id": "other.testnet", "token_id": 101},
    )
    assert r3.status_code == 400
    ids = client.get("/api/minted-ids").json()
    assert "42" in ids["minted_ids"]
    stats = client.get("/api/mint-stats").json()
    assert "42" in stats.get("minted_ids", [])
