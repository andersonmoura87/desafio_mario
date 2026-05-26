"""
Camada de persistência — SQLite.
Armazena snapshots de preços para análise histórica real.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "stock_history.db"))


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Cria as tabelas se ainda não existirem."""
    with _conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS price_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol      TEXT    NOT NULL,
                price       REAL    NOT NULL,
                change_val  REAL,
                change_pct  REAL,
                volume      INTEGER,
                source      TEXT    DEFAULT 'live',
                fetched_at  TEXT    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_symbol_time
                ON price_history (symbol, fetched_at);

            CREATE TABLE IF NOT EXISTS api_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                event      TEXT NOT NULL,
                detail     TEXT,
                created_at TEXT NOT NULL
            );
        """)


def save_price(
    symbol: str,
    price: float,
    change: float,
    change_pct: float,
    volume: int,
    source: str = "live",
) -> None:
    """Persiste um snapshot de preço."""
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO price_history
                (symbol, price, change_val, change_pct, volume, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (symbol, price, change, change_pct, volume, source,
             datetime.now(timezone.utc).isoformat()),
        )


def get_history(symbol: str, days: int = 30) -> list[dict]:
    """Retorna snapshots dos últimos N dias para um símbolo."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT price, change_val, change_pct, volume, source, fetched_at
            FROM price_history
            WHERE symbol = ?
              AND fetched_at >= datetime('now', ?)
            ORDER BY fetched_at ASC
            """,
            (symbol, f"-{days} days"),
        ).fetchall()
    return [dict(r) for r in rows]


def get_stats(symbol: str, days: int = 30) -> dict:
    """Retorna estatísticas agregadas do período."""
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*)          AS snapshots,
                MIN(price)        AS min_price,
                MAX(price)        AS max_price,
                AVG(price)        AS avg_price,
                MIN(fetched_at)   AS first_seen,
                MAX(fetched_at)   AS last_seen
            FROM price_history
            WHERE symbol = ?
              AND fetched_at >= datetime('now', ?)
            """,
            (symbol, f"-{days} days"),
        ).fetchone()
    return dict(row) if row else {}


def log_event(event: str, detail: str = "") -> None:
    """Registra um evento de auditoria."""
    with _conn() as conn:
        conn.execute(
            "INSERT INTO api_events (event, detail, created_at) VALUES (?, ?, ?)",
            (event, detail, datetime.now(timezone.utc).isoformat()),
        )
