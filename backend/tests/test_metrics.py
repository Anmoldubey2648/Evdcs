"""Tests for metric calculations, cutoff selection, and matching logic."""
import pytest
from datetime import datetime, timedelta, timezone
from metrics import (
    aggregate_actuals_hourly, build_delivery_rows, compute_metrics, select_forecast_for_cutoff,
    match_pairs, MatchedPair
)

UTC = timezone.utc


def dt(s):
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


# --- compute_metrics ---

def test_metrics_basic():
    pairs = [
        MatchedPair("t1", 100, 90, 10),
        MatchedPair("t2", 80, 100, -20),
        MatchedPair("t3", 120, 100, 20),
    ]
    m = compute_metrics(pairs)
    assert m["n"] == 3
    assert m["mae"] == pytest.approx((10 + 20 + 20) / 3, abs=0.01)
    assert m["mbe"] == pytest.approx((10 - 20 + 20) / 3, abs=0.01)
    assert m["mape_undefined"] is False
    assert m["mape_n"] == 3


def test_metrics_empty():
    m = compute_metrics([])
    assert m["mae"] is None
    assert m["rmse"] is None
    assert m["mbe"] is None
    assert m["n"] == 0
    assert m["mape_undefined"] is True


def test_mape_excludes_zero_actuals():
    pairs = [
        MatchedPair("t1", 50, 0, 50),    # zero actual — excluded from MAPE
        MatchedPair("t2", 100, 100, 0),  # error=0, mape contribution=0
    ]
    m = compute_metrics(pairs)
    assert m["mape_n"] == 1   # only t2 counts
    assert m["mape"] == pytest.approx(0.0)


def test_mape_all_zero_actuals():
    pairs = [MatchedPair("t1", 100, 0, 100)]
    m = compute_metrics(pairs)
    assert m["mape"] is None
    assert m["mape_undefined"] is True


def test_rmse_calculation():
    pairs = [MatchedPair("t1", 103, 100, 3), MatchedPair("t2", 96, 100, -4)]
    m = compute_metrics(pairs)
    import math
    assert m["rmse"] == pytest.approx(math.sqrt((9 + 16) / 2), abs=0.01)


# --- select_forecast_for_cutoff ---

def test_select_latest_before_cutoff():
    cutoff = dt("2026-01-01T11:00:00")
    forecasts = [
        {"publish_time": dt("2026-01-01T09:00:00"), "generation_mw": 100},
        {"publish_time": dt("2026-01-01T10:30:00"), "generation_mw": 200},  # best
        {"publish_time": dt("2026-01-01T11:00:00"), "generation_mw": 300},  # exactly at cutoff
        {"publish_time": dt("2026-01-01T12:00:00"), "generation_mw": 400},  # after — excluded
    ]
    best = select_forecast_for_cutoff(forecasts, cutoff)
    assert best["generation_mw"] == 300  # exactly at cutoff is eligible


def test_select_no_eligible_forecast():
    cutoff = dt("2026-01-01T08:00:00")
    forecasts = [
        {"publish_time": dt("2026-01-01T09:00:00"), "generation_mw": 100},
    ]
    assert select_forecast_for_cutoff(forecasts, cutoff) is None


def test_select_single_eligible():
    cutoff = dt("2026-01-01T11:00:00")
    forecasts = [{"publish_time": dt("2026-01-01T06:00:00"), "generation_mw": 500}]
    best = select_forecast_for_cutoff(forecasts, cutoff)
    assert best["generation_mw"] == 500


# --- match_pairs ---

def test_match_pairs_basic():
    cutoff = dt("2026-01-01T11:00:00")
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 990},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1010},
        {"start_time": dt("2026-01-02T01:00:00"), "generation_mw": 1190},
        {"start_time": dt("2026-01-02T01:30:00"), "generation_mw": 1210},
    ]
    forecasts = [
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 1050},
        {"start_time": dt("2026-01-02T01:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 1150},
        {"start_time": dt("2026-01-02T02:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 900},  # no actual
    ]
    matched, unmatched = match_pairs(actuals, forecasts, cutoff)
    assert len(matched) == 2
    assert len(unmatched) == 0
    assert matched[0].error_mw == 50


def test_match_pairs_missing_forecast():
    cutoff = dt("2026-01-01T11:00:00")
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 1000},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1000},
    ]
    forecasts = []  # no forecasts
    matched, unmatched = match_pairs(actuals, forecasts, cutoff)
    assert len(matched) == 0
    assert len(unmatched) == 1


def test_match_pairs_normalizes_delivery_timestamps_to_utc():
    actuals = [
        {"start_time": datetime.fromisoformat("2026-01-02T00:00:00"), "generation_mw": 1000},
        {"start_time": datetime.fromisoformat("2026-01-02T00:30:00"), "generation_mw": 1000},
    ]
    forecasts = [{
        "start_time": datetime.fromisoformat("2026-01-01T19:00:00-05:00"),
        "publish_time": dt("2026-01-01T10:00:00"),
        "generation_mw": 1050,
    }]

    matched, unmatched = match_pairs(actuals, forecasts, dt("2026-01-01T11:00:00"))

    assert len(matched) == 1
    assert not unmatched
    assert matched[0].error_mw == 50


def test_delivery_rows_normalize_iso_timestamp_offsets_and_keep_missing_periods():
    actuals = [
        {"start_time": datetime.fromisoformat("2026-01-02T00:00:00"), "generation_mw": 1000},
        {"start_time": datetime.fromisoformat("2026-01-02T00:30:00"), "generation_mw": 900},
        {"start_time": datetime.fromisoformat("2026-01-02T01:00:00"), "generation_mw": 900},
    ]
    forecasts = [{
        "start_time": "2026-01-01T19:00:00-05:00",
        "publish_time": dt("2026-01-01T10:00:00"),
        "generation_mw": 1050,
    }]

    rows = build_delivery_rows(actuals, forecasts, dt("2026-01-01T11:00:00"))

    assert len(rows) == 24
    assert rows[0]["forecast_available"] is True
    assert rows[0]["actual_available"] is True
    assert rows[0]["actual_mw"] == 950
    assert rows[0]["error_mw"] == 100
    assert rows[1]["forecast_available"] is False
    assert rows[1]["forecast_mw"] is None
    assert rows[1]["actual_available"] is False
    assert rows[1]["actual_incomplete"] is True
    assert rows[1]["error_mw"] is None


def test_delivery_rows_are_exactly_24_hour_starts_and_ignore_off_hour_forecasts():
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 800},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1000},
    ]
    forecasts = [
        {
            "start_time": dt("2026-01-02T00:00:00"),
            "publish_time": dt("2026-01-01T10:00:00"),
            "generation_mw": 900,
        },
        {
            "start_time": dt("2026-01-02T00:30:00"),
            "publish_time": dt("2026-01-01T10:00:00"),
            "generation_mw": 9999,
        },
        {
            "start_time": dt("2026-01-03T00:00:00"),
            "publish_time": dt("2026-01-01T10:00:00"),
            "generation_mw": 9999,
        },
    ]

    rows = build_delivery_rows(
        actuals,
        forecasts,
        dt("2026-01-01T11:00:00"),
        "2026-01-02",
    )

    assert len(rows) == 24
    assert [row["start_time"] for row in rows] == [
        dt("2026-01-02T00:00:00") + timedelta(hours=hour)
        for hour in range(24)
    ]
    assert rows[0]["actual_mw"] == 900
    assert rows[0]["forecast_mw"] == 900
    assert rows[0]["matched"] is True
    assert all(row["forecast_mw"] != 9999 for row in rows)


def test_match_pairs_no_duplicate_counting():
    """Duplicate forecast entries must not inflate matches."""
    cutoff = dt("2026-01-01T11:00:00")
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 1000},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1000},
    ]
    forecasts = [
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 1050},
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 1050},  # dup
    ]
    matched, _ = match_pairs(actuals, forecasts, cutoff)
    assert len(matched) == 1


def test_hourly_actual_aggregation_requires_both_half_hours():
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 800},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1000},
        {"start_time": dt("2026-01-02T01:00:00"), "generation_mw": 1200},
    ]

    hourly = aggregate_actuals_hourly(actuals)

    assert hourly == [
        {
            "start_time": dt("2026-01-02T00:00:00"),
            "generation_mw": 900,
            "actual_available": True,
            "actual_incomplete": False,
            "actual_source_periods": 2,
        },
        {
            "start_time": dt("2026-01-02T01:00:00"),
            "generation_mw": None,
            "actual_available": False,
            "actual_incomplete": True,
            "actual_source_periods": 1,
        },
    ]


def test_hourly_aggregation_uses_utc_hour_boundaries():
    actuals = [
        {"start_time": datetime.fromisoformat("2026-01-01T19:00:00-05:00"), "generation_mw": 800},
        {"start_time": datetime.fromisoformat("2026-01-01T19:30:00-05:00"), "generation_mw": 1000},
    ]

    hourly = aggregate_actuals_hourly(actuals)

    assert hourly[0]["start_time"] == dt("2026-01-02T00:00:00")
    assert hourly[0]["generation_mw"] == 900
    assert hourly[0]["actual_available"] is True


def test_duplicate_or_off_boundary_half_hour_does_not_form_an_hour():
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 800},
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 900},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1000},
        {"start_time": dt("2026-01-02T01:15:00"), "generation_mw": 600},
    ]

    hourly = aggregate_actuals_hourly(actuals)

    assert hourly[0]["actual_available"] is False
    assert hourly[0]["generation_mw"] is None
    assert hourly[1]["actual_available"] is False
    assert hourly[1]["generation_mw"] is None


def test_incomplete_hour_is_not_scored_even_when_forecast_is_available():
    actuals = [{"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 900}]
    forecasts = [{
        "start_time": dt("2026-01-02T00:00:00"),
        "publish_time": dt("2026-01-01T10:00:00"),
        "generation_mw": 1000,
    }]

    rows = build_delivery_rows(actuals, forecasts, dt("2026-01-01T11:00:00"))

    assert rows[0]["forecast_available"] is True
    assert rows[0]["actual_incomplete"] is True
    assert rows[0]["matched"] is False
    assert rows[0]["error_mw"] is None


def test_latest_eligible_vintage_is_selected_independently_per_hour():
    cutoff = dt("2026-01-01T11:00:00")
    actuals = [
        {"start_time": dt("2026-01-02T00:00:00"), "generation_mw": 900},
        {"start_time": dt("2026-01-02T00:30:00"), "generation_mw": 1100},
        {"start_time": dt("2026-01-02T01:00:00"), "generation_mw": 1000},
        {"start_time": dt("2026-01-02T01:30:00"), "generation_mw": 1000},
    ]
    forecasts = [
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T09:00:00"), "generation_mw": 900},
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T10:30:00"), "generation_mw": 1100},
        {"start_time": dt("2026-01-02T00:00:00"), "publish_time": dt("2026-01-01T11:30:00"), "generation_mw": 9999},
        {"start_time": dt("2026-01-02T01:00:00"), "publish_time": dt("2026-01-01T08:30:00"), "generation_mw": 950},
        {"start_time": dt("2026-01-02T01:00:00"), "publish_time": dt("2026-01-01T10:00:00"), "generation_mw": 1000},
    ]

    rows = build_delivery_rows(actuals, forecasts, cutoff)

    assert rows[0]["forecast_mw"] == 1100
    assert rows[0]["publish_time"] == dt("2026-01-01T10:30:00")
    assert rows[1]["forecast_mw"] == 1000
    assert rows[1]["publish_time"] == dt("2026-01-01T10:00:00")
    assert all(row["publish_time"] <= cutoff for row in rows if row["publish_time"])


def test_timezone_aware_comparison():
    """Cutoff and forecast publish times must be timezone-aware."""
    cutoff = dt("2026-01-01T11:00:00")
    forecasts = [{"publish_time": dt("2026-01-01T10:59:00"), "generation_mw": 200}]
    best = select_forecast_for_cutoff(forecasts, cutoff)
    assert best is not None


def test_cutoff_selection_normalizes_naive_and_aware_utc_times():
    cutoff = datetime.fromisoformat("2026-01-01T11:00:00+00:00")
    forecasts = [
        {"publish_time": datetime.fromisoformat("2026-01-01T10:00:00"), "generation_mw": 100},
        {"publish_time": datetime.fromisoformat("2026-01-01T05:30:00-05:00"), "generation_mw": 200},
        {"publish_time": datetime.fromisoformat("2026-01-01T06:01:00-05:00"), "generation_mw": 300},
        {"generation_mw": 400},
    ]
    best = select_forecast_for_cutoff(forecasts, cutoff)
    assert best["generation_mw"] == 200


def test_naive_cutoff_is_interpreted_as_utc():
    cutoff = datetime.fromisoformat("2026-01-01T11:00:00")
    forecasts = [
        {"publish_time": datetime.fromisoformat("2026-01-01T11:00:00+00:00"), "generation_mw": 100},
        {"publish_time": datetime.fromisoformat("2026-01-01T11:01:00+00:00"), "generation_mw": 200},
    ]
    best = select_forecast_for_cutoff(forecasts, cutoff)
    assert best["generation_mw"] == 100
