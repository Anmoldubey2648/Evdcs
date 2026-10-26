"""API response tests for source-faithful UTC matching and January scope."""
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://test:test@localhost/gridbricks_test",
)

from main import accuracy_daily, explorer, kpis, timeseries

UTC = timezone.utc


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class FakeDB:
    def __init__(self, actuals, forecasts):
        self.actuals = actuals
        self.forecasts = forecasts

    def execute(self, statement, params=None):
        sql = str(statement).lower()
        if "from wind_actual" in sql:
            source = self.actuals
            actual = True
        elif "from wind_forecast" in sql:
            source = self.forecasts
            actual = False
        else:
            raise AssertionError(f"Unexpected SQL in API test: {sql}")

        if params and "start_utc" in params:
            start, end = params["start_utc"], params["end_utc"]
        elif params and "delivery_start_utc" in params:
            start, end = params["delivery_start_utc"], params["delivery_end_utc"]
        else:
            raise AssertionError("Delivery query must use an explicit UTC range")

        source = [row for row in source if start <= row["start_time"] < end]
        if "as delivery_date" in sql:
            source = [
                {**row, "delivery_date": row["start_time"].astimezone(UTC).date()}
                for row in source
            ]
        fields = ("start_time", "generation_mw") if actual else (
            "start_time", "publish_time", "generation_mw"
        )
        return FakeResult([SimpleNamespace(**{field: row[field] for field in fields + (
            ("delivery_date",) if "delivery_date" in row else ()
        )}) for row in source])


def records_for_delivery(delivery_date):
    day = datetime.fromisoformat(delivery_date).replace(tzinfo=UTC)
    actuals = [
        {
            "start_time": day + timedelta(minutes=30 * period),
            "generation_mw": 1000 + (period // 2) * 2,
        }
        for period in range(48)
    ]
    forecasts = []
    for hour in range(24):
        start = day + timedelta(hours=hour)
        actual = 1000 + 2 * hour
        forecasts.extend([
            {
                "start_time": start,
                "publish_time": day - timedelta(days=1) + timedelta(hours=7, minutes=30),
                "generation_mw": actual + 40,
            },
            {
                "start_time": start,
                "publish_time": day - timedelta(days=1) + timedelta(hours=9, minutes=30),
                "generation_mw": actual + 20,
            },
            {
                "start_time": start,
                "publish_time": day - timedelta(days=1) + timedelta(hours=11, minutes=30),
                "generation_mw": actual + 9999,
            },
        ])
    return actuals, forecasts


def test_selected_day_api_series_and_metrics_share_the_same_matches():
    actuals, forecasts = records_for_delivery("2026-01-16")
    db = FakeDB(actuals, forecasts)

    summary = kpis("2026-01-15", "2026-01-16", "11:00", db)
    series = timeseries("2026-01-15", "2026-01-16", "11:00", db)["data"]
    table = explorer("2026-01-16", "2026-01-15", "11:00", 100, 0, db)["data"]

    assert summary["n_complete_actual"] == 24
    assert summary["total_hours"] == 24
    assert summary["n_matched"] == 24
    assert summary["n_unmatched"] == 0
    assert summary["mae_mw"] == 20
    assert summary["rmse_mw"] == 20
    assert summary["mbe_mw"] == 20
    assert summary["coverage_pct"] == 100

    assert len(series) == len(table) == 24
    assert len({row["start_time"] for row in series}) == len(series)
    assert [row["start_time"] for row in series] == sorted(row["start_time"] for row in series)
    assert sum(row["forecast_available"] for row in series) == 24
    assert sum(row["forecast_available"] for row in table) == 24
    assert sum(row["actual_available"] for row in series) == 24
    assert sum(row["matched"] for row in series) == summary["n_matched"]
    assert all((row["forecast_mw"] is not None) == row["forecast_available"] for row in series)
    assert all((row["actual_mw"] is not None) == row["actual_available"] for row in series)
    assert all((row["forecast_mw"] is not None) == row["forecast_available"] for row in table)
    assert series[0]["publish_time"] == "2026-01-15T09:30:00+00:00"
    assert series[0]["error_mw"] == 20
    assert series[1]["actual_mw"] == 1002
    assert series[1]["forecast_mw"] == 1022
    assert series[1]["error_mw"] == 20
    assert all(row["publish_time"] <= "2026-01-15T11:00:00+00:00"
               for row in series if row["publish_time"])


def test_daily_api_returns_only_31_january_decisions_and_their_deliveries():
    actuals, forecasts = [], []
    for delivery_date in ("2026-01-02", "2026-02-01", "2026-02-02"):
        day_actuals, day_forecasts = records_for_delivery(delivery_date)
        actuals.extend(day_actuals)
        forecasts.extend(day_forecasts)

    response = accuracy_daily("11:00", FakeDB(actuals, forecasts))
    rows = response["data"]

    assert len(rows) == 31
    assert rows[0]["decision_date"] == "2026-01-01"
    assert rows[0]["delivery_date"] == "2026-01-02"
    assert rows[-1]["decision_date"] == "2026-01-31"
    assert rows[-1]["delivery_date"] == "2026-02-01"
    assert all(row["delivery_date"] != "2026-02-02" for row in rows)
    assert rows[0]["n_complete_actual"] == 24
    assert rows[0]["n_matched"] == 24
    assert rows[0]["n_unmatched"] == 0
    assert rows[0]["n_expected"] == 24
    assert rows[0]["coverage_pct"] == 100
    assert rows[-1]["n_complete_actual"] == 24
    assert rows[-1]["n_matched"] == 24


def test_incomplete_half_hour_reduces_match_coverage_without_filling_data():
    actuals, forecasts = records_for_delivery("2026-01-16")
    actuals = [
        row for row in actuals
        if row["start_time"] != datetime.fromisoformat("2026-01-16T00:30:00+00:00")
    ]
    db = FakeDB(actuals, forecasts)

    summary = kpis("2026-01-15", "2026-01-16", "11:00", db)
    rows = timeseries("2026-01-15", "2026-01-16", "11:00", db)["data"]
    daily = accuracy_daily("11:00", db)["data"][14]

    assert summary["n_matched"] == 23
    assert summary["total_hours"] == 24
    assert summary["n_incomplete_actual"] == 1
    assert summary["coverage_pct"] == pytest.approx(95.8, abs=0.1)
    assert rows[0]["actual_mw"] is None
    assert rows[0]["actual_incomplete"] is True
    assert rows[0]["forecast_available"] is True
    assert rows[0]["matched"] is False
    assert rows[0]["error_mw"] is None
    assert daily["n_incomplete_actual"] == 1
    assert daily["n_complete_actual"] == 23
    assert daily["n_matched"] == 23
