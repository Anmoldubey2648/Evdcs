from datetime import timedelta

from date_ranges import january_decision_delivery_window


def test_january_decisions_map_to_31_utc_delivery_dates():
    first_delivery, end_delivery_exclusive = january_decision_delivery_window()
    delivery_dates = [
        first_delivery + timedelta(days=offset)
        for offset in range((end_delivery_exclusive - first_delivery).days)
    ]

    assert len(delivery_dates) == 31
    assert delivery_dates[0].isoformat() == "2026-01-02"
    assert delivery_dates[-1].isoformat() == "2026-02-01"
    assert (delivery_dates[0] - timedelta(days=1)).isoformat() == "2026-01-01"
    assert (delivery_dates[-1] - timedelta(days=1)).isoformat() == "2026-01-31"
