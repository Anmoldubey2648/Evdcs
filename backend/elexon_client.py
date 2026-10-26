"""Elexon BMRS API client — FUELHH and WINDFOR datasets."""
import asyncio
import httpx
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
TIMEOUT = 30.0
MAX_RETRIES = 3


async def _get(client: httpx.AsyncClient, url: str, params: dict) -> List[Dict[str, Any]]:
    for attempt in range(MAX_RETRIES):
        try:
            r = await client.get(url, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, list):
                raise RuntimeError("Elexon returned an unexpected response shape; expected a list")
            return data
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError) as exc:
            if attempt == MAX_RETRIES - 1:
                raise
            await asyncio.sleep(2 ** attempt)
    raise RuntimeError("Elexon request exhausted retries without a response")


async def fetch_wind_actuals_for_date(date_str: str) -> List[Dict[str, Any]]:
    """Fetch FUELHH WIND actuals for a specific settlement date (YYYY-MM-DD)."""
    url = f"{BASE_URL}/datasets/FUELHH/stream"
    params = {
        "fuelType": "WIND",
        "settlementDateFrom": date_str,
        "settlementDateTo": date_str,
    }
    async with httpx.AsyncClient() as client:
        records = await _get(client, url, params)
    if any(record.get("fuelType") != "WIND" for record in records):
        raise RuntimeError(f"FUELHH returned non-WIND records for {date_str}")
    return records


async def fetch_wind_forecasts_published_on(decision_date: str, cutoff_time: str = "11:00") -> List[Dict[str, Any]]:
    """
    Fetch WINDFOR forecasts published on the decision date up to cutoff_time UTC.
    Uses publishDateTimeFrom/publishDateTimeTo parameters.
    """
    url = f"{BASE_URL}/datasets/WINDFOR/stream"
    publish_from = f"{decision_date}T00:00:00Z"
    h, m = cutoff_time.split(":")
    publish_to = f"{decision_date}T{h}:{m}:00Z"
    params = {
        "publishDateTimeFrom": publish_from,
        "publishDateTimeTo": publish_to,
    }
    async with httpx.AsyncClient() as client:
        return await _get(client, url, params)


async def fetch_actuals_chunked(start_date: str, end_date: str) -> List[Dict]:
    """Fetch actuals for each day in the range (idempotent, chunked by day)."""
    results = []
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        try:
            chunk = await fetch_wind_actuals_for_date(date_str)
            results.extend(chunk)
        except Exception as exc:
            raise RuntimeError(f"Failed fetching FUELHH actuals for {date_str}") from exc
        current += timedelta(days=1)
    return results


async def fetch_forecasts_for_decision_dates(decision_dates: List[str]) -> List[Dict]:
    """
    Fetch WINDFOR forecasts published on each decision date (up to 23:59 UTC).
    Decision date = day before delivery.
    """
    results = []
    for decision_date in decision_dates:
        try:
            url = f"{BASE_URL}/datasets/WINDFOR/stream"
            params = {
                "publishDateTimeFrom": f"{decision_date}T00:00:00Z",
                "publishDateTimeTo": f"{decision_date}T23:59:59Z",
            }
            async with httpx.AsyncClient() as client:
                chunk = await _get(client, url, params)
            results.extend(chunk)
        except Exception as exc:
            raise RuntimeError(f"Failed fetching WINDFOR forecasts for {decision_date}") from exc
    return results
