"""Metric calculations for forecast accuracy evaluation."""
import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class MatchedPair:
    start_time: str
    forecast_mw: float
    actual_mw: float
    error_mw: float  # forecast - actual


def compute_metrics(pairs: List[MatchedPair]) -> dict:
    """
    Compute MAE, RMSE, Mean Bias Error, MAPE from matched forecast-actual pairs.
    Excludes zero actuals from MAPE only. Reports sample count and coverage.
    Returns dict with all metrics or None values when insufficient data.
    """
    n = len(pairs)
    if n == 0:
        return {
            "mae": None, "rmse": None, "mbe": None,
            "mape": None, "mape_n": 0, "n": 0,
            "mape_undefined": True,
        }

    errors = [p.error_mw for p in pairs]
    abs_errors = [abs(e) for e in errors]
    sq_errors = [e ** 2 for e in errors]

    mae = sum(abs_errors) / n
    rmse = math.sqrt(sum(sq_errors) / n)
    mbe = sum(errors) / n  # positive = overforecast

    # MAPE excludes zero actuals
    nonzero = [p for p in pairs if p.actual_mw != 0]
    mape_n = len(nonzero)
    if mape_n > 0:
        mape = (sum(abs(p.error_mw / p.actual_mw) for p in nonzero) / mape_n) * 100
    else:
        mape = None

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mbe": round(mbe, 2),
        "mape": round(mape, 2) if mape is not None else None,
        "mape_n": mape_n,
        "mape_undefined": mape is None,
        "n": n,
    }


def select_forecast_for_cutoff(
    forecasts: List[dict],
    cutoff_dt,
) -> Optional[dict]:
    """
    Select the forecast with the greatest publishTime at or before cutoff_dt.
    Never selects a later publication. Ensures consistent UTC comparison.
    """
    from datetime import timezone

    cutoff_utc = (
        cutoff_dt.replace(tzinfo=timezone.utc)
        if cutoff_dt.tzinfo is None
        else cutoff_dt.astimezone(timezone.utc)
    )
    best = None
    best_publish_time = None
    for f in forecasts:
        pt = f.get("publish_time")
        if pt is None:
            continue
        publish_time_utc = (
            pt.replace(tzinfo=timezone.utc)
            if pt.tzinfo is None
            else pt.astimezone(timezone.utc)
        )
        if publish_time_utc <= cutoff_utc and (
            best_publish_time is None or publish_time_utc > best_publish_time
        ):
            best = f
            best_publish_time = publish_time_utc
    return best


def normalize_delivery_timestamp(value):
    """Normalize database datetimes and ISO timestamps to an aware UTC datetime."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def aggregate_actuals_hourly(actuals: List[dict]) -> List[dict]:
    """Average complete pairs of FUELHH half-hours into UTC delivery hours."""
    from collections import defaultdict

    buckets = defaultdict(lambda: {"periods": {}, "invalid_periods": 0})
    for actual in actuals:
        start_time = normalize_delivery_timestamp(actual["start_time"])
        if not isinstance(start_time, datetime):
            continue

        hour_start = start_time.replace(minute=0, second=0, microsecond=0)
        if start_time.second or start_time.microsecond or start_time.minute not in (0, 30):
            buckets[hour_start]["invalid_periods"] += 1
            continue

        minute = start_time.minute
        if minute in buckets[hour_start]["periods"]:
            buckets[hour_start]["invalid_periods"] += 1
        else:
            buckets[hour_start]["periods"][minute] = actual["generation_mw"]

    hourly = []
    for start_time, bucket in sorted(buckets.items()):
        periods = bucket["periods"]
        complete = (
            bucket["invalid_periods"] == 0
            and set(periods) == {0, 30}
        )
        hourly.append({
            "start_time": start_time,
            "generation_mw": (
                (periods[0] + periods[30]) / 2 if complete else None
            ),
            "actual_available": complete,
            "actual_incomplete": not complete,
            "actual_source_periods": len(periods),
        })
    return hourly


def build_delivery_rows(
    actuals: List[dict],
    forecasts: List[dict],
    cutoff_dt,
    expected_delivery_date=None,
) -> List[dict]:
    """Build one row per expected UTC delivery hour using source-vintage selection."""
    from collections import defaultdict

    hourly_actuals = aggregate_actuals_hourly(actuals)
    actuals_by_start = {
        normalize_delivery_timestamp(actual["start_time"]): actual
        for actual in hourly_actuals
    }
    by_start = defaultdict(list)
    for forecast in forecasts:
        by_start[normalize_delivery_timestamp(forecast["start_time"])].append(forecast)

    if expected_delivery_date is None:
        expected_delivery_date = (
            hourly_actuals[0]["start_time"].date()
            if hourly_actuals
            else (
                normalize_delivery_timestamp(forecasts[0]["start_time"]).date()
                if forecasts
                else normalize_delivery_timestamp(cutoff_dt).date()
                + timedelta(days=1)
            )
        )
    if isinstance(expected_delivery_date, str):
        expected_delivery_date = datetime.fromisoformat(expected_delivery_date).date()
    if isinstance(expected_delivery_date, datetime):
        expected_delivery_date = expected_delivery_date.date()

    day_start = datetime.combine(expected_delivery_date, datetime.min.time(), tzinfo=timezone.utc)
    hour_starts = {
        day_start + timedelta(hours=hour)
        for hour in range(24)
    }

    rows = []
    for start_time in sorted(hour_starts):
        actual = actuals_by_start.get(start_time)
        candidates = by_start.get(start_time, [])
        forecast = select_forecast_for_cutoff(candidates, cutoff_dt)
        actual_available = bool(actual and actual["actual_available"])
        forecast_available = forecast is not None
        matched = actual_available and forecast_available
        actual_mw = actual["generation_mw"] if actual_available else None
        error = (
            forecast["generation_mw"] - actual_mw
            if matched else None
        )
        rows.append({
            "start_time": start_time,
            "actual_mw": actual_mw,
            "forecast_mw": forecast["generation_mw"] if forecast else None,
            "publish_time": forecast["publish_time"] if forecast else None,
            "error_mw": error,
            "forecast_available": forecast_available,
            "actual_available": actual_available,
            "actual_incomplete": bool(actual and actual["actual_incomplete"]),
            "actual_source_periods": actual["actual_source_periods"] if actual else 0,
            "matched": matched,
        })
    return rows


def match_pairs(
    actuals: List[dict],
    forecasts: List[dict],
    cutoff_dt,
) -> Tuple[List[MatchedPair], List[str]]:
    """
    Match each actual delivery period with the best forecast at or before cutoff_dt.
    Returns (valid hourly pairs, complete-actual hours without an eligible forecast).
    """
    matched = []
    unmatched = []
    for row in build_delivery_rows(actuals, forecasts, cutoff_dt):
        if row["matched"]:
            matched.append(MatchedPair(
                start_time=row["start_time"],
                forecast_mw=row["forecast_mw"],
                actual_mw=row["actual_mw"],
                error_mw=row["error_mw"],
            ))
        elif row["actual_available"] and not row["forecast_available"]:
            unmatched.append(row["start_time"])
    return matched, unmatched
