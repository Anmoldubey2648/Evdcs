import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { fetchTimeseries } from '../api'
import { SectionHeader, EmptyState, ErrorState, CustomTooltip, CHART_COLORS, Badge, hasForecastMatch } from '../components'
import { formatUtc } from '../dateUtils'

function numericValue(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function ErrorBar({ value }) {
  const color = Math.abs(value) < 500 ? 'var(--emerald)' : Math.abs(value) < 1500 ? 'var(--warning)' : 'var(--danger)'
  return <span className="mono text-xs font-medium" style={{ color }}>{value > 0 ? '+' : ''}{value} MW</span>
}

export default function ForecastAnalysis({ decisionDate, deliveryDate, cutoffTime }) {
  const requestKey = `${decisionDate}|${deliveryDate}|${cutoffTime}`
  const [request, setRequest] = useState({ key: null, status: 'idle' })

  useEffect(() => {
    let active = true
    setRequest({ key: requestKey, status: 'loading' })
    fetchTimeseries(decisionDate, deliveryDate, cutoffTime)
      .then(data => { if (active) setRequest({ key: requestKey, status: 'success', data }) })
      .catch(e => {
        if (active) setRequest({ key: requestKey, status: 'error', error: e.response?.data?.detail || e.message })
      })
    return () => { active = false }
  }, [decisionDate, deliveryDate, cutoffTime, requestKey])

  const isCurrent = request.key === requestKey
  const loading = !isCurrent || request.status === 'loading'
  const error = isCurrent && request.status === 'error' ? request.error : null
  const data = isCurrent && request.status === 'success' ? request.data : null
  const rows = data?.data ?? []
  const chartData = rows
    .map(row => ({
      ...row,
      timestamp: Date.parse(row.start_time),
      forecast: hasForecastMatch(row) ? numericValue(row.forecast_mw) : null,
      actual: numericValue(row.actual_mw),
      error: numericValue(row.error_mw),
      forecastAvailable: hasForecastMatch(row),
      actualAvailable: row.actual_available === true,
      actualIncomplete: row.actual_incomplete === true,
      matched: row.matched === true,
    }))
    .filter(row => Number.isFinite(row.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
  const chartTicks = chartData
    .filter((_, index) => index % 6 === 0 || index === chartData.length - 1)
    .map(row => row.timestamp)
  const hasData = chartData.length > 0 && chartData.some(d => d.actual != null || d.forecast != null)

  const matchedRows = chartData.filter(row => row.matched)
  const publishTimes = [...new Set(matchedRows.map(r => r.publish_time).filter(Boolean))]
  const incompleteActualHours = chartData.filter(row => row.actualIncomplete).length

  return (
    <div className="space-y-6 max-w-7xl">
      <SectionHeader
        title="Forecast vs Actual Generation"
        sub={`Hourly generation for ${deliveryDate}: WINDFOR forecasts matched to the mean of both UTC FUELHH half-hours · cutoff: ${cutoffTime} UTC on ${decisionDate}`}
      />

      {error && <ErrorState message={error} />}

      {/* Publication info */}
      {rows.length > 0 && (
        <div className="glass p-3 flex flex-wrap gap-2 items-center text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>Forecast vintages used:</span>
          {publishTimes.slice(0, 5).map(t => (
            <Badge key={t} color="var(--emerald)">{formatUtc(t, 'datetime-year')} UTC</Badge>
          ))}
          {publishTimes.length > 5 && <span style={{ color: 'var(--text-secondary)' }}>+{publishTimes.length - 5} more</span>}
          {publishTimes.length === 0 && <span style={{ color: 'var(--warning)' }}>No eligible forecast publications</span>}
          <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {matchedRows.length}/{chartData.length} expected hourly periods matched
          {incompleteActualHours > 0 && ` · ${incompleteActualHours} incomplete FUELHH hours excluded`}
          </span>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="glass skeleton" style={{ height: 380 }} />
      ) : error ? null : !hasData ? (
        <EmptyState message="No timeseries data for this date" />
      ) : (
        <div className="glass forecast-chart p-4">
          <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>Hourly generation (MW) · actual = mean of the two source half-hours</span>
            <span>Incomplete actual hours remain blank; no interpolation</span>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={chartData.length
                  ? [chartData[0].timestamp, chartData[chartData.length - 1].timestamp]
                  : ['dataMin', 'dataMax']}
                ticks={chartTicks}
                interval={0}
                tickFormatter={value => formatUtc(new Date(value).toISOString(), 'time')}
                minTickGap={16}
                tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={['dataMin - 500', 'dataMax + 500']}
                tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                content={<CustomTooltip />}
                allowEscapeViewBox={{ x: true, y: true }}
              />
              <Legend
                verticalAlign="bottom"
                height={58}
                wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 6, lineHeight: '18px' }}
              />
              <Line
                type="linear"
                dataKey="actual"
                name="Actual (FUELHH hourly mean)"
                stroke={CHART_COLORS.actual}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.actual, stroke: 'var(--bg-base)', strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="forecast"
                name="Forecast (WINDFOR)"
                stroke={CHART_COLORS.forecast}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.forecast, stroke: 'var(--bg-base)', strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Period table */}
      {hasData && (
        <div className="glass overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Period Details</span>
          </div>
          <div className="table-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                  {['Delivery hour (UTC)', 'WINDFOR forecast MW', 'FUELHH hourly mean MW', 'Forecast error (F−A)', 'Forecast published (UTC)'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map(r => (
                  <tr key={r.start_time} className="transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatUtc(r.start_time, 'time')}
                    </td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--emerald)' }}>
                      {r.forecast != null ? r.forecast.toLocaleString() : 'No hourly forecast'}
                    </td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--info)' }}>
                      {r.actual != null ? r.actual.toLocaleString() : r.actualIncomplete ? `Incomplete (${r.actual_source_periods}/2)` : 'No actual'}
                    </td>
                    <td className="px-4 py-2">
                      {r.error != null ? <ErrorBar value={r.error} /> : '—'}
                    </td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>
                      {r.publish_time ? `${formatUtc(r.publish_time, 'datetime-year')} UTC` : 'No eligible forecast'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
