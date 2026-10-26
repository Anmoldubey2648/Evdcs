import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'
const EXPECTED_DELIVERY_HOURS = 24
const JANUARY_DECISION_DAYS = 31

const client = axios.create({
  baseURL: BASE,
  timeout: 30000,
})

function assertHourlyDelivery(data, endpoint, deliveryDate) {
  const rows = data?.data
  const message = `The ${endpoint} API returned an incompatible hourly dataset. Expected 24 UTC hours for ${deliveryDate}; restart the backend from this project and reload the dashboard.`
  if (!Array.isArray(rows) || rows.length !== EXPECTED_DELIVERY_HOURS) {
    throw new Error(message)
  }

  const dayStart = Date.parse(`${deliveryDate}T00:00:00Z`)
  const isCanonical = rows.every((row, index) => {
    const timestamp = Date.parse(row.start_time)
    return Number.isFinite(timestamp)
      && timestamp === dayStart + index * 60 * 60 * 1000
  })
  if (!isCanonical) throw new Error(message)

  return data
}

export async function fetchHealth() {
  const { data } = await client.get('/health')
  return data
}

export async function fetchKPIs(decisionDate, deliveryDate, cutoffTime = '11:00') {
  const { data } = await client.get('/kpis', {
    params: { decision_date: decisionDate, delivery_date: deliveryDate, cutoff_time: cutoffTime }
  })
  if (
    data?.total_hours !== EXPECTED_DELIVERY_HOURS
    || !Number.isInteger(data?.n_matched)
    || !Number.isInteger(data?.n_complete_actual)
    || !Number.isInteger(data?.n_incomplete_actual)
    || !Number.isInteger(data?.n_missing_actual)
    || !Number.isInteger(data?.n_unmatched)
    || !Number.isInteger(data?.n_forecast_missing)
    || !Number.isFinite(data?.coverage_pct)
    || data.n_matched < 0
    || data.n_matched > EXPECTED_DELIVERY_HOURS
    || data.n_complete_actual < data.n_matched
    || data.n_matched + data.n_unmatched !== data.n_complete_actual
    || data.n_complete_actual + data.n_incomplete_actual + data.n_missing_actual !== EXPECTED_DELIVERY_HOURS
    || data.coverage_pct !== Math.round(data.n_matched / EXPECTED_DELIVERY_HOURS * 1000) / 10
  ) {
    throw new Error('The KPI API is using an incompatible hourly data contract. Restart the backend from this project and reload the dashboard.')
  }
  return data
}

export async function fetchTimeseries(decisionDate, deliveryDate, cutoffTime = '11:00') {
  const { data } = await client.get('/timeseries', {
    params: { decision_date: decisionDate, delivery_date: deliveryDate, cutoff_time: cutoffTime }
  })
  return assertHourlyDelivery(data, 'Timeseries', deliveryDate)
}

export async function fetchDailyAccuracy(cutoffTime = '11:00') {
  const { data } = await client.get('/accuracy/daily', {
    params: { cutoff_time: cutoffTime }
  })
  const rows = data?.data
  const isCanonical = Array.isArray(rows)
    && rows.length === JANUARY_DECISION_DAYS
    && rows.every((row, index) => {
      const expectedDecisionDate = `2026-01-${String(index + 1).padStart(2, '0')}`
      const expectedDeliveryDate = index === JANUARY_DECISION_DAYS - 1
        ? '2026-02-01'
        : `2026-01-${String(index + 2).padStart(2, '0')}`
      return row.decision_date === expectedDecisionDate
        && row.delivery_date === expectedDeliveryDate
        && row.n_expected === EXPECTED_DELIVERY_HOURS
        && Number.isInteger(row.n_complete_actual)
        && Number.isInteger(row.n_incomplete_actual)
        && Number.isInteger(row.n_missing_actual)
        && Number.isInteger(row.n_matched)
        && Number.isInteger(row.n_unmatched)
        && Number.isFinite(row.coverage_pct)
        && row.n_complete_actual + row.n_incomplete_actual + row.n_missing_actual === EXPECTED_DELIVERY_HOURS
        && row.n_matched + row.n_unmatched === row.n_complete_actual
        && row.coverage_pct === Math.round(row.n_matched / EXPECTED_DELIVERY_HOURS * 1000) / 10
    })
  if (!isCanonical) {
    throw new Error('The daily accuracy API must return the 31 January 2026 decisions and their next-day deliveries. Restart the backend from this project and reload the dashboard.')
  }
  return data
}

export async function fetchExplorer(deliveryDate, decisionDate, cutoffTime = '11:00', limit = 100, offset = 0) {
  const { data } = await client.get('/explorer', {
    params: { delivery_date: deliveryDate, decision_date: decisionDate, cutoff_time: cutoffTime, limit, offset }
  })
  if (offset === 0 && limit >= EXPECTED_DELIVERY_HOURS && data?.total !== EXPECTED_DELIVERY_HOURS) {
    throw new Error(`The Explorer API returned ${data?.total ?? 'an unknown number of'} records; expected 24 UTC hourly rows for ${deliveryDate}. Restart the backend from this project and reload the dashboard.`)
  }
  if (offset === 0 && limit >= EXPECTED_DELIVERY_HOURS) {
    return assertHourlyDelivery(data, 'Explorer', deliveryDate)
  }
  return data
}

export async function fetchAvailableDates() {
  const { data } = await client.get('/available_dates')
  return data
}
