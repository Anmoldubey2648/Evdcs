from datetime import date, timedelta


def january_decision_delivery_window():
    """UTC delivery dates corresponding to January 2026 decision dates."""
    first_decision = date(2026, 1, 1)
    first_delivery = first_decision + timedelta(days=1)
    end_delivery_exclusive = first_decision + timedelta(days=32)
    return first_delivery, end_delivery_exclusive
