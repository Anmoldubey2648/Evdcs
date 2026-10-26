"""Elexon sync fetch failures must not produce silent partial data batches."""
import asyncio

import pytest

import elexon_client


def test_actual_fetch_failure_aborts_batch_with_delivery_date(monkeypatch):
    async def fail(_date):
        raise OSError("upstream unavailable")

    monkeypatch.setattr(elexon_client, "fetch_wind_actuals_for_date", fail)

    with pytest.raises(RuntimeError, match="FUELHH actuals for 2026-01-02"):
        asyncio.run(elexon_client.fetch_actuals_chunked("2026-01-02", "2026-01-02"))


def test_forecast_fetch_failure_aborts_batch_with_decision_date(monkeypatch):
    async def fail(*_args, **_kwargs):
        raise OSError("upstream unavailable")

    monkeypatch.setattr(elexon_client, "_get", fail)

    with pytest.raises(RuntimeError, match="WINDFOR forecasts for 2026-01-15"):
        asyncio.run(elexon_client.fetch_forecasts_for_decision_dates(["2026-01-15"]))


def test_actual_fetch_rejects_records_outside_wind_fuel_type(monkeypatch):
    async def non_wind_records(_client, _url, params):
        assert params["fuelType"] == "WIND"
        return [{"fuelType": "GAS"}]

    monkeypatch.setattr(elexon_client, "_get", non_wind_records)

    with pytest.raises(RuntimeError, match="FUELHH returned non-WIND records"):
        asyncio.run(elexon_client.fetch_wind_actuals_for_date("2026-01-16"))


def test_get_rejects_unexpected_success_payload_shape():
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"error": "unexpected object"}

    class FakeClient:
        async def get(self, *_args, **_kwargs):
            return FakeResponse()

    with pytest.raises(RuntimeError, match="expected a list"):
        asyncio.run(elexon_client._get(FakeClient(), "https://elexon.example", {}))
