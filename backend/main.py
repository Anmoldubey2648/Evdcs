"""FastAPI application — GridBricks Wind Forecast Intelligence."""
import os
from datetime import date, datetime, timedelta, timezone, time
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from dotenv import load_dotenv

from database import get_db, init_db, WindActual, WindForecast
from date_ranges import january_decision_delivery_window
from metrics import MatchedPair, build_delivery_rows, compute_metrics
from sync import run_sync, upsert_actuals, upsert_forecasts

load_dotenv()

# --- Config ---
DEFAULT_CUTOFF_TIME = os.environ.get("DECISION_CUTOFF_TIME", "11:00")  # HH:MM UTC
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app = FastAPI(title="GridBricks API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    path = request.scope["path"]
    if path == "/api" or path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
        raw_path = request.scope.get("raw_path")
        if isinstance(raw_path, bytes) and (
            raw_path == b"/api" or raw_path.startswith(b"/api/")
        ):
            request.scope["raw_path"] = raw_path[4:] or b"/"
    return await call_next(request)


@app.middleware("http")
async def prevent_api_response_caching(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
def startup():
    init_db()


# ---- helpers ----

def parse_cutoff(date_str: str, cutoff_time_str: str) -> datetime:
    """Build a UTC datetime for the decision cutoff on the decision date."""
    h, m = map(int, cutoff_time_str.split(":"))
    decision_date = datetime.fromisoformat(date_str)
    return datetime(decision_date.year, decision_date.month, decision_date.day,
                    h, m, 0, tzinfo=timezone.utc)


def utc_day_bounds(day_str: str):
    day = date.fromisoformat(day_str)
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def serialize_delivery_rows(rows: list) -> list:
    return [
        {
            **row,
            "start_time": row["start_time"].isoformat()
            if hasattr(row["start_time"], "isoformat") else str(row["start_time"]),
            "publish_time": row["publish_time"].isoformat()
            if row["publish_time"] and hasattr(row["publish_time"], "isoformat")
            else row["publish_time"],
            "error_mw": round(row["error_mw"], 1) if row["error_mw"] is not None else None,
            "forecast_available": row["forecast_available"],
            "actual_available": row["actual_available"],
            "actual_incomplete": row["actual_incomplete"],
            "actual_source_periods": row["actual_source_periods"],
            "matched": row["matched"],
            }
        for row in rows
    ]


def db_actuals_for_delivery_date(db: Session, delivery_date: str) -> list:
    start_utc, end_utc = utc_day_bounds(delivery_date)
    rows = db.execute(
        text("""
            SELECT start_time, generation_mw
            FROM wind_actual
            WHERE start_time >= :start_utc AND start_time < :end_utc
            ORDER BY start_time
        """),
        {"start_utc": start_utc, "end_utc": end_utc}
    ).fetchall()
    return [{"start_time": r.start_time, "generation_mw": r.generation_mw} for r in rows]


def db_forecasts_for_delivery_date(db: Session, delivery_date: str) -> list:
    start_utc, end_utc = utc_day_bounds(delivery_date)
    rows = db.execute(
        text("""
            SELECT start_time, publish_time, generation_mw
            FROM wind_forecast
            WHERE start_time >= :start_utc AND start_time < :end_utc
            ORDER BY start_time, publish_time
        """),
        {"start_utc": start_utc, "end_utc": end_utc}
    ).fetchall()
    return [{"start_time": r.start_time, "publish_time": r.publish_time,
             "generation_mw": r.generation_mw} for r in rows]


# ---- endpoints ----

@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    actual_count = db.execute(text("SELECT COUNT(*) FROM wind_actual")).scalar()
    forecast_count = db.execute(text("SELECT COUNT(*) FROM wind_forecast")).scalar()
    last_actual = db.execute(
        text("SELECT MAX(synced_at) FROM wind_actual")
    ).scalar()
    last_forecast = db.execute(
        text("SELECT MAX(synced_at) FROM wind_forecast")
    ).scalar()

    return {
        "status": "ok" if db_ok else "degraded",
        "db_connected": db_ok,
        "actual_records": actual_count,
        "forecast_records": forecast_count,
        "last_actual_sync": last_actual,
        "last_forecast_sync": last_forecast,
        "decision_cutoff_default": DEFAULT_CUTOFF_TIME + " UTC",
        "data_note": (
            "FUELHH actuals are half-hourly; WINDFOR forecasts are hourly. "
            "Each hourly actual is the mean of its two UTC half-hourly actuals; incomplete hours are not scored. "
            "Decision cutoff configurable via DECISION_CUTOFF_TIME env var. "
            "January 2026 decision dates; delivery Feb 1 also covered."
        ),
    }


@app.get("/kpis")
def kpis(
    decision_date: str = Query(..., description="YYYY-MM-DD decision date"),
    delivery_date: str = Query(..., description="YYYY-MM-DD delivery date"),
    cutoff_time: str = Query(DEFAULT_CUTOFF_TIME, description="HH:MM UTC cutoff"),
    db: Session = Depends(get_db),
):
    cutoff_dt = parse_cutoff(decision_date, cutoff_time)
    actuals = db_actuals_for_delivery_date(db, delivery_date)
    forecasts = db_forecasts_for_delivery_date(db, delivery_date)

    rows = build_delivery_rows(actuals, forecasts, cutoff_dt, delivery_date)
    matched = [
        row for row in rows
        if row["matched"]
    ]
    pairs = [
        MatchedPair(
            start_time=row["start_time"],
            forecast_mw=row["forecast_mw"],
            actual_mw=row["actual_mw"],
            error_mw=row["error_mw"],
        )
        for row in matched
    ]
    metrics = compute_metrics(pairs)

    expected_hours = 24
    complete_actual_hours = sum(row["actual_available"] for row in rows)
    observed_actual_hours = sum(row["actual_source_periods"] > 0 for row in rows)
    incomplete_actual_hours = sum(row["actual_incomplete"] for row in rows)
    matched_periods = len(matched)
    coverage_pct = round(matched_periods / expected_hours * 100, 1)

    avg_forecast = round(sum(p["forecast_mw"] for p in matched) / len(matched), 1) if matched else None
    avg_actual = round(sum(p["actual_mw"] for p in matched) / len(matched), 1) if matched else None

    return {
        "decision_date": decision_date,
        "delivery_date": delivery_date,
        "cutoff_utc": cutoff_dt.isoformat(),
        "avg_forecast_mw": avg_forecast,
        "avg_actual_mw": avg_actual,
        "mae_mw": metrics["mae"],
        "rmse_mw": metrics["rmse"],
        "mbe_mw": metrics["mbe"],
        "mape_pct": metrics["mape"],
        "mape_n": metrics["mape_n"],
        "mape_undefined": metrics["mape_undefined"],
        "n_matched": metrics["n"],
        "n_unmatched": sum(
            row["actual_available"] and not row["forecast_available"] for row in rows
        ),
        "n_complete_actual": complete_actual_hours,
        "total_hours": expected_hours,
        "n_incomplete_actual": incomplete_actual_hours,
        "n_missing_actual": expected_hours - observed_actual_hours,
        "n_forecast_missing": sum(not row["forecast_available"] for row in rows),
        "coverage_pct": coverage_pct,
    }


@app.get("/timeseries")
def timeseries(
    decision_date: str = Query(...),
    delivery_date: str = Query(...),
    cutoff_time: str = Query(DEFAULT_CUTOFF_TIME),
    db: Session = Depends(get_db),
):
    cutoff_dt = parse_cutoff(decision_date, cutoff_time)
    actuals = db_actuals_for_delivery_date(db, delivery_date)
    forecasts = db_forecasts_for_delivery_date(db, delivery_date)

    rows = serialize_delivery_rows(
        build_delivery_rows(actuals, forecasts, cutoff_dt, delivery_date)
    )

    return {"data": rows, "cutoff_utc": cutoff_dt.isoformat()}


@app.get("/accuracy/daily")
def accuracy_daily(
    cutoff_time: str = Query(DEFAULT_CUTOFF_TIME),
    db: Session = Depends(get_db),
):
    """Per-day metrics for each January 2026 decision date."""
    delivery_start, delivery_end = january_decision_delivery_window()

    delivery_start_utc = datetime.combine(delivery_start, time.min, tzinfo=timezone.utc)
    delivery_end_utc = datetime.combine(delivery_end, time.min, tzinfo=timezone.utc)
    date_filter = "start_time >= :delivery_start_utc AND start_time < :delivery_end_utc"
    params = {
        "delivery_start_utc": delivery_start_utc,
        "delivery_end_utc": delivery_end_utc,
    }
    actual_rows = db.execute(
        text(f"""
            SELECT (start_time AT TIME ZONE 'UTC')::date AS delivery_date,
                   start_time, generation_mw
            FROM wind_actual
            WHERE {date_filter}
            ORDER BY start_time
        """),
        params,
    ).fetchall()
    forecast_rows = db.execute(
        text(f"""
            SELECT (start_time AT TIME ZONE 'UTC')::date AS delivery_date,
                   start_time, publish_time, generation_mw
            FROM wind_forecast
            WHERE {date_filter}
            ORDER BY start_time, publish_time
        """),
        params,
    ).fetchall()

    actuals_by_delivery = {}
    for row in actual_rows:
        actuals_by_delivery.setdefault(str(row.delivery_date), []).append({
            "start_time": row.start_time,
            "generation_mw": row.generation_mw,
        })

    forecasts_by_delivery = {}
    for row in forecast_rows:
        forecasts_by_delivery.setdefault(str(row.delivery_date), []).append({
            "start_time": row.start_time,
            "publish_time": row.publish_time,
            "generation_mw": row.generation_mw,
        })

    results = []
    for offset in range((delivery_end - delivery_start).days):
        delivery_str = (delivery_start + timedelta(days=offset)).isoformat()
        # Decision date is the day before delivery
        decision_dt_str = (datetime.fromisoformat(delivery_str) - timedelta(days=1)).strftime("%Y-%m-%d")
        cutoff_dt = parse_cutoff(decision_dt_str, cutoff_time)

        actuals = actuals_by_delivery.get(delivery_str, [])
        forecasts = forecasts_by_delivery.get(delivery_str, [])
        rows = build_delivery_rows(
            actuals, forecasts, cutoff_dt, delivery_str
        )
        matched = [row for row in rows if row["matched"]]
        pairs = [
            MatchedPair(
                start_time=row["start_time"],
                forecast_mw=row["forecast_mw"],
                actual_mw=row["actual_mw"],
                error_mw=row["error_mw"],
            )
            for row in matched
        ]
        m = compute_metrics(pairs)
        expected_hours = 24
        complete_actual_hours = sum(row["actual_available"] for row in rows)
        observed_actual_hours = sum(row["actual_source_periods"] > 0 for row in rows)
        incomplete_actual_hours = sum(row["actual_incomplete"] for row in rows)
        unmatched = sum(
            row["actual_available"] and not row["forecast_available"] for row in rows
        )

        results.append({
            "delivery_date": delivery_str,
            "decision_date": decision_dt_str,
            "mae_mw": m["mae"],
            "rmse_mw": m["rmse"],
            "mbe_mw": m["mbe"],
            "mape_pct": m["mape"],
            "mape_n": m["mape_n"],
            "n_complete_actual": complete_actual_hours,
            "n_expected": expected_hours,
            "n_incomplete_actual": incomplete_actual_hours,
            "n_missing_actual": expected_hours - observed_actual_hours,
            "n_matched": m["n"],
            "n_unmatched": unmatched,
            "n_forecast_missing": sum(not row["forecast_available"] for row in rows),
            "coverage_pct": round(m["n"] / expected_hours * 100, 1),
        })

    return {"data": results, "cutoff_time_utc": cutoff_time}


@app.get("/explorer")
def explorer(
    delivery_date: str = Query(...),
    decision_date: Optional[str] = Query(None),
    cutoff_time: str = Query(DEFAULT_CUTOFF_TIME),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    if decision_date is None:
        decision_date = (datetime.fromisoformat(delivery_date) - timedelta(days=1)).strftime("%Y-%m-%d")
    cutoff_dt = parse_cutoff(decision_date, cutoff_time)

    actuals = db_actuals_for_delivery_date(db, delivery_date)
    forecasts = db_forecasts_for_delivery_date(db, delivery_date)
    rows = serialize_delivery_rows(
        build_delivery_rows(actuals, forecasts, cutoff_dt, delivery_date)
    )

    total = len(rows)
    paginated = rows[offset: offset + limit]
    return {
        "data": paginated,
        "total": total,
        "offset": offset,
        "limit": limit,
        "cutoff_utc": cutoff_dt.isoformat(),
    }


@app.post("/sync")
async def trigger_sync(
    secret: str = Query(..., description="Sync authorization secret"),
    db: Session = Depends(get_db),
):
    expected = os.environ.get("SYNC_SECRET", "")
    if not expected or secret != expected:
        raise HTTPException(status_code=403, detail="Invalid sync secret")
    result = await run_sync(verbose=False)
    return {"status": "ok", "result": result}


@app.get("/available_dates")
def available_dates(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT DISTINCT date(start_time AT TIME ZONE 'UTC') as d
            FROM wind_actual
            ORDER BY d
        """)
    ).fetchall()
    return {"dates": [str(r.d) for r in rows]}
