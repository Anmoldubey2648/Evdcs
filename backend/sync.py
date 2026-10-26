"""Data sync: ingest Elexon data into Neon PostgreSQL (idempotent)."""
import asyncio
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db, SessionLocal, WindActual, WindForecast
from elexon_client import fetch_actuals_chunked, fetch_forecasts_for_decision_dates
from sqlalchemy.dialects.postgresql import insert as pg_insert

# January 2026 decision dates: Jan 01–31; delivery is Jan 02 – Feb 01
DELIVERY_DATES = [
    (datetime(2026, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
    for i in range(32)  # Jan 1 – Feb 1 inclusive
]
DECISION_DATES = [
    (datetime(2026, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
    for i in range(31)  # Jan 1 – Jan 31
]


def _parse_dt(s: str):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def upsert_actuals(db, records):
    if not records:
        return 0
    rows = []
    seen = set()
    for r in records:
        key = r["startTime"]
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "start_time": _parse_dt(r["startTime"]),
            "settlement_date": r["settlementDate"],
            "settlement_period": r["settlementPeriod"],
            "generation_mw": float(r["generation"]),
            "publish_time": _parse_dt(r["publishTime"]) if r.get("publishTime") else None,
        })
    if not rows:
        return 0
    stmt = pg_insert(WindActual).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_wind_actual_start",
        set_={"generation_mw": stmt.excluded.generation_mw,
              "publish_time": stmt.excluded.publish_time},
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount


def upsert_forecasts(db, records):
    if not records:
        return 0
    rows = []
    seen = set()
    for r in records:
        key = (r["startTime"], r["publishTime"])
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "start_time": _parse_dt(r["startTime"]),
            "publish_time": _parse_dt(r["publishTime"]),
            "generation_mw": float(r["generation"]),
        })
    if not rows:
        return 0
    stmt = pg_insert(WindForecast).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_wind_forecast_start_publish",
        set_={"generation_mw": stmt.excluded.generation_mw},
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount


async def run_sync(verbose: bool = True):
    init_db()
    db = SessionLocal()
    total_act = 0
    total_for = 0
    try:
        # Fetch actuals: Jan 1 through Feb 1, 2026 (delivery dates)
        if verbose:
            print(f"[sync] Fetching actuals for {len(DELIVERY_DATES)} delivery dates...")
        actuals = await fetch_actuals_chunked(DELIVERY_DATES[0], DELIVERY_DATES[-1])
        n_act = upsert_actuals(db, actuals)
        total_act += n_act
        if verbose:
            print(f"[sync] Upserted {n_act} actual records ({len(actuals)} fetched)")

        # Fetch forecasts: published on each decision date (Dec 31 through Jan 31)
        # We also want Dec 31 to cover Jan 1 delivery
        all_decision_dates = [
            (datetime(2025, 12, 31)).strftime("%Y-%m-%d")  # for Jan 1 delivery
        ] + DECISION_DATES
        if verbose:
            print(f"[sync] Fetching forecasts for {len(all_decision_dates)} decision dates...")
        forecasts = await fetch_forecasts_for_decision_dates(all_decision_dates)
        n_for = upsert_forecasts(db, forecasts)
        total_for += n_for
        if verbose:
            print(f"[sync] Upserted {n_for} forecast records ({len(forecasts)} fetched)")

        return {"actuals_upserted": total_act, "forecasts_upserted": total_for}
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_sync())
