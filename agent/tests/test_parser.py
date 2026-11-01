import pytest

from agent.parsers.rules import ParseError, parse_rules


def test_long_eth_full():
    o = parse_rules("long ETH at 3200, TP 3500, SL 3100")
    assert o.side == "long"
    assert o.coin == "ETH"
    assert o.entry == 3200
    assert o.tp == 3500
    assert o.sl == 3100


def test_short_btc():
    o = parse_rules("short BTC size 0.01 tp 95000 sl 102000")
    assert o.side == "short"
    assert o.coin == "BTC"
    assert o.size == 0.01
    assert o.tp == 95000
    assert o.sl == 102000


def test_market_buy():
    o = parse_rules("buy SOL at market, take profit 220, stop 180")
    assert o.side == "long"
    assert o.coin == "SOL"
    assert o.market is True
    assert o.tp == 220
    assert o.sl == 180


def test_bad_tp_long():
    with pytest.raises(ParseError):
        parse_rules("long ETH at 3200, TP 3000, SL 3100")


def test_missing_side():
    with pytest.raises(ParseError):
        parse_rules("ETH at 3200 tp 3500")
