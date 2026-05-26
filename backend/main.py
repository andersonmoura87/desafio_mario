"""
Nintendo Stock Quest — Backend API
FastAPI com observabilidade: logging JSON, métricas Prometheus, health check e persistência SQLite.
"""

import json
import logging
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
import yfinance as yf
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

import database


# ─── Logging estruturado (JSON) ───────────────────────────────────────────────


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level":     record.levelname,
            "logger":    record.name,
            "message":   record.getMessage(),
            "service":   "nintendo-stock-api",
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _setup_logger(name: str) -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger = logging.getLogger(name)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


log = _setup_logger("nintendo_stock")

# ─── Métricas em memória (formato Prometheus) ─────────────────────────────────

_counters: dict[str, float] = defaultdict(float)
_start_time = time.time()


def _inc(metric: str, value: float = 1.0) -> None:
    _counters[metric] += value


# ─── Aplicação ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Nintendo Stock Quest API",
    version="1.0.0",
    description="Backend de observabilidade e dados de ações da Nintendo (NTDOY).",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    database.init_db()
    database.log_event("startup", "API iniciada")
    log.info(json.dumps({"event": "startup", "version": "1.0.0"}))


# ─── Middleware de observabilidade ────────────────────────────────────────────

@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    correlation_id = str(uuid.uuid4())[:8]
    start = time.perf_counter()

    log.info(json.dumps({
        "event":          "request_start",
        "correlation_id": correlation_id,
        "method":         request.method,
        "path":           request.url.path,
    }))

    _inc("http_requests_total")

    try:
        response = await call_next(request)
        status = response.status_code
    except Exception as exc:
        _inc("http_errors_total")
        log.exception("unhandled_exception")
        raise exc

    duration_ms = (time.perf_counter() - start) * 1000
    _inc("http_request_duration_ms_total", duration_ms)
    _inc(f"http_status_{status}_total")

    log.info(json.dumps({
        "event":          "request_end",
        "correlation_id": correlation_id,
        "method":         request.method,
        "path":           request.url.path,
        "status":         status,
        "duration_ms":    round(duration_ms, 2),
    }))

    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Duration-Ms"] = f"{duration_ms:.1f}"
    return response


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", summary="Health check", tags=["Observabilidade"])
def health() -> dict:
    uptime_s = round(time.time() - _start_time, 1)
    return {
        "status":         "healthy",
        "service":        "nintendo-stock-api",
        "version":        "1.0.0",
        "uptime_seconds": uptime_s,
        "requests_total": int(_counters["http_requests_total"]),
        "errors_total":   int(_counters["http_errors_total"]),
        "timestamp":      datetime.now(timezone.utc).isoformat(),
    }


@app.get("/metrics", response_class=PlainTextResponse,
         summary="Métricas Prometheus", tags=["Observabilidade"])
def prometheus_metrics() -> str:
    req = int(_counters["http_requests_total"])
    err = int(_counters["http_errors_total"])
    dur = _counters["http_request_duration_ms_total"]
    avg = (dur / req) if req > 0 else 0
    uptime = round(time.time() - _start_time, 1)

    lines = [
        "# HELP http_requests_total Total de requisições HTTP",
        "# TYPE http_requests_total counter",
        f"http_requests_total {req}",
        "",
        "# HELP http_errors_total Total de erros HTTP",
        "# TYPE http_errors_total counter",
        f"http_errors_total {err}",
        "",
        "# HELP http_request_duration_ms_avg Duração média das requisições (ms)",
        "# TYPE http_request_duration_ms_avg gauge",
        f"http_request_duration_ms_avg {avg:.2f}",
        "",
        "# HELP process_uptime_seconds Tempo de execução do processo",
        "# TYPE process_uptime_seconds gauge",
        f"process_uptime_seconds {uptime}",
        "",
        "# HELP http_error_rate Taxa de erro (erros / total)",
        "# TYPE http_error_rate gauge",
        f"http_error_rate {(err / req if req > 0 else 0):.4f}",
        "",
    ]

    for key, val in _counters.items():
        if key.startswith("stock_") and key.endswith("_requests_total"):
            sym = key.split("_")[1]
            lines += [
                f"# HELP stock_{sym}_requests_total Buscas para {sym}",
                f"# TYPE stock_{sym}_requests_total counter",
                f"stock_{sym}_requests_total {int(val)}",
                "",
            ]

    return "\n".join(lines)


@app.get("/api/stock/{symbol}", summary="Cotação em tempo real", tags=["Stock"])
def get_stock(symbol: str) -> dict:
    sym = symbol.upper()
    log.info(json.dumps({"event": "stock_fetch", "symbol": sym}))

    try:
        ticker = yf.Ticker(sym)
        info = ticker.info or {}
        hist = ticker.history(period="1mo")

        price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("navPrice")
        )

        if not price:
            raise HTTPException(
                status_code=404,
                detail=f"Símbolo '{sym}' não encontrado ou mercado fechado.",
            )

        prev_close = (
            info.get("previousClose")
            or info.get("regularMarketPreviousClose")
            or price
        )

        change = round(price - prev_close, 2)
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
        history_c = [round(v, 2) for v in hist["Close"].dropna().tolist()[-30:]]

        _inc(f"stock_{sym}_requests_total")

        # Persistir snapshot no banco
        database.save_price(sym, price, change, change_pct, info.get("volume") or 0)

        return {
            "symbol":        sym,
            "name":          info.get("longName", sym),
            "price":         round(price, 2),
            "change":        change,
            "changePercent": change_pct,
            "open":          round(info.get("open") or price, 2),
            "high":          round(info.get("dayHigh") or price, 2),
            "low":           round(info.get("dayLow") or price, 2),
            "volume":        info.get("volume") or 0,
            "avgVolume":     info.get("averageVolume") or 0,
            "marketCap":     info.get("marketCap") or 0,
            "pe":            info.get("trailingPE"),
            "eps":           info.get("trailingEps"),
            "dividendYield": round((info.get("dividendYield") or 0) * 100, 2),
            "week52High":    info.get("fiftyTwoWeekHigh"),
            "week52Low":     info.get("fiftyTwoWeekLow"),
            "beta":          info.get("beta"),
            "history":       history_c,
            "source":        "live",
            "fetchedAt":     datetime.now(timezone.utc).isoformat(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        _inc("http_errors_total")
        log.error(json.dumps({"event": "stock_error", "symbol": sym, "error": str(exc)}))
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados: {exc}") from exc


@app.get("/api/stock/{symbol}/history",
         summary="Histórico persistido no banco", tags=["Stock"])
def get_stock_history(symbol: str, days: int = 30) -> dict:
    sym = symbol.upper()
    rows = database.get_history(sym, days)
    stats = database.get_stats(sym, days)
    return {
        "symbol":     sym,
        "days":       days,
        "snapshots":  len(rows),
        "stats":      stats,
        "data":       rows,
    }
