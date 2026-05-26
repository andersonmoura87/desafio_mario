"""
Testes da API Nintendo Stock Quest.
Execução: pytest tests/ -v
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app  # noqa: E402

client = TestClient(app)


# ─── /health ─────────────────────────────────────────────────────────────────


class TestHealth:
    def test_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_status_is_healthy(self):
        data = client.get("/health").json()
        assert data["status"] == "healthy"

    def test_has_required_fields(self):
        data = client.get("/health").json()
        for field in ("service", "version", "uptime_seconds", "timestamp"):
            assert field in data, f"Campo ausente: {field}"

    def test_version(self):
        assert client.get("/health").json()["version"] == "1.0.0"


# ─── /metrics ────────────────────────────────────────────────────────────────


class TestMetrics:
    def test_returns_200(self):
        assert client.get("/metrics").status_code == 200

    def test_content_type_is_plain_text(self):
        resp = client.get("/metrics")
        assert "text/plain" in resp.headers["content-type"]

    def test_contains_prometheus_counters(self):
        body = client.get("/metrics").text
        assert "http_requests_total" in body
        assert "http_errors_total" in body
        assert "process_uptime_seconds" in body


# ─── /api/stock/{symbol} ─────────────────────────────────────────────────────


def _mock_ticker(price: float = 13.45, prev_close: float = 13.22):
    """Cria um mock do yfinance.Ticker com dados controlados."""
    import pandas as pd

    mock = MagicMock()
    mock.info = {
        "currentPrice": price,
        "previousClose": prev_close,
        "open": prev_close,
        "dayHigh": price + 0.20,
        "dayLow": price - 0.15,
        "volume": 1_234_567,
        "averageVolume": 987_000,
        "marketCap": 17_800_000_000,
        "trailingPE": 18.5,
        "trailingEps": 0.73,
        "dividendYield": 0.021,
        "fiftyTwoWeekHigh": 16.89,
        "fiftyTwoWeekLow": 10.12,
        "beta": 0.62,
        "longName": "Nintendo Co., Ltd.",
    }
    closes = [11.0 + i * 0.08 for i in range(30)]
    mock.history.return_value = pd.DataFrame({"Close": closes})
    return mock


class TestStockEndpoint:
    @patch("main.yf.Ticker")
    def test_valid_symbol_returns_200(self, mock_yf):
        mock_yf.return_value = _mock_ticker()
        resp = client.get("/api/stock/NTDOY")
        assert resp.status_code == 200

    @patch("main.yf.Ticker")
    def test_response_has_required_fields(self, mock_yf):
        mock_yf.return_value = _mock_ticker()
        data = client.get("/api/stock/NTDOY").json()
        for field in (
            "symbol",
            "price",
            "change",
            "changePercent",
            "open",
            "high",
            "low",
            "volume",
            "history",
            "week52High",
            "week52Low",
            "source",
            "fetchedAt",
        ):
            assert field in data, f"Campo ausente: {field}"

    @patch("main.yf.Ticker")
    def test_symbol_is_uppercased(self, mock_yf):
        mock_yf.return_value = _mock_ticker()
        data = client.get("/api/stock/ntdoy").json()
        assert data["symbol"] == "NTDOY"

    @patch("main.yf.Ticker")
    def test_change_is_calculated_correctly(self, mock_yf):
        mock_yf.return_value = _mock_ticker(price=13.45, prev_close=13.22)
        data = client.get("/api/stock/NTDOY").json()
        assert abs(data["change"] - 0.23) < 0.01
        assert abs(data["changePercent"] - 1.74) < 0.05

    @patch("main.yf.Ticker")
    def test_history_has_up_to_30_entries(self, mock_yf):
        mock_yf.return_value = _mock_ticker()
        data = client.get("/api/stock/NTDOY").json()
        assert 1 <= len(data["history"]) <= 30

    @patch("main.yf.Ticker")
    def test_source_is_live(self, mock_yf):
        mock_yf.return_value = _mock_ticker()
        assert client.get("/api/stock/NTDOY").json()["source"] == "live"

    @patch("main.yf.Ticker")
    def test_empty_info_returns_404(self, mock_yf):
        import pandas as pd

        m = MagicMock()
        m.info = {}
        m.history.return_value = pd.DataFrame({"Close": []})
        mock_yf.return_value = m
        assert client.get("/api/stock/INVALID").status_code == 404

    @patch("main.yf.Ticker")
    def test_exception_returns_500(self, mock_yf):
        mock_yf.side_effect = Exception("conexão recusada")
        assert client.get("/api/stock/NTDOY").status_code == 500


# ─── Headers de observabilidade ──────────────────────────────────────────────


class TestObservabilityHeaders:
    def test_health_has_correlation_id(self):
        resp = client.get("/health")
        assert "x-correlation-id" in resp.headers

    def test_health_has_duration_header(self):
        resp = client.get("/health")
        assert "x-duration-ms" in resp.headers

    def test_duration_is_numeric(self):
        resp = client.get("/health")
        duration = float(resp.headers["x-duration-ms"])
        assert duration >= 0
