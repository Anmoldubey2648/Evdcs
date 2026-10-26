import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { fetchDailyAccuracy } from '../api'
import { SectionHeader, EmptyState, ErrorState } from '../components'
import { shiftIsoDate } from '../dateUtils'

const CHART_COLORS = {
  mae: '#10b981', rmse: '#a78bfa', mbe: '#f59e0b',
  grid: 'rgba(255,255,255,0.05)',
}

function MetricBadge({ value, unit = 'MW', positive = false }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = positive
    ? value > 0 ? 'var(--danger)' : 'var(--emerald)'
    : 'var(--text-primary)'
  return (
    <span className="mono font-medium" style={{ color }}>
      {positive && value > 0 ? '+' : ''}{Number(value).toFixed(1)} {unit}
    </span>
  )
}

export default function HistoricalAccuracy({ decisionDate, cutoffTime }) {
  const [request, setRequest] = useState({ key: null, status: 'idle' })
  const requestKey = cutoffTime

  useEffect(() => {
    let active = true
    setRequest({ key: requestKey, status: 'loading' })
    fetchDailyAccuracy(cutoffTime)
      .then(data => { if (active) setRequest({ key: requestKey, status: 'success', data }) })
      .catch(e => {
        if (active) setRequest({ key: requestKey, status: 'error', error: e.response?.data?.detail || e.message })
      })
    return () => { active = false }
  }, [cutoffTime, requestKey])

  const isCurrent = request.key === requestKey
  const loading = !isCurrent || request.status === 'loading'
  const error = isCurrent && request.status === 'error' ? request.error : null
  const data = isCurrent && request.status === 'success' ? request.data : null
  const rows = (data?.data ?? []).filter(row =>
    row.decision_date >= '2026-01-01' && row.decision_date <= '2026-01-31'
  )
  const chartData = rows
    .filter(r => r.mae_mw != null)
    .map(r => ({
      date: r.delivery_date === '2026-02-01' ? 'Feb 1*' : r.delivery_date.slice(5),
      mae: r.mae_mw,
      rmse: r.rmse_mw,
      mbe: r.mbe_mw,
      n: r.n_matched,
    }))
  const coveragePercent = row => {
    if (row.coverage_pct != null) return row.coverage_pct
    const expectedHours = row.n_expected ?? 24
    return expectedHours > 0 ? Math.round(row.n_matched / expectedHours * 1000) / 10 : 0
  }

  const hasData = rows.length > 0 && rows.some(r => r.mae_mw != null)
  const hasActuals = rows.some(r => r.n_complete_actual > 0 || r.n_incomplete_actual > 0)
  const hasMatches = rows.some(r => r.n_matched > 0)
  const selectedDeliveryDate = shiftIsoDate(decisionDate, 1)

  // Summary stats
  const validRows = rows.filter(r => r.mae_mw != null)
  const avgMae = validRows.length ? (validRows.reduce((s, r) => s + r.mae_mw, 0) / validRows.length).toFixed(1) : null
  const avgRmse = validRows.length ? (validRows.reduce((s, r) => s + r.rmse_mw, 0) / validRows.length).toFixed(1) : null
  const avgMbe = validRows.length ? (validRows.reduce((s, r) => s + r.mbe_mw, 0) / validRows.length).toFixed(1) : null
  const avgMape = (() => {
    const m = rows.filter(r => r.mape_pct != null)
    return m.length ? (m.reduce((s, r) => s + r.mape_pct, 0) / m.length).toFixed(2) : null
  })()

  return (
    <div className="space-y-6 max-w-7xl">
      <SectionHeader
        title="Historical Accuracy — hourly January 2026 decisions"
        sub={`31 January decision dates · Selected: ${decisionDate} decision → ${selectedDeliveryDate} delivery · Cutoff: ${cutoffTime} UTC. Feb 1 delivery is included for Jan 31.`}
      />

      {error && <ErrorState message={error} />}

      {/* Summary KPIs */}
      <div className="accuracy-summary-grid grid gap-4">
        {[
          { label: 'Daily mean MAE', value: avgMae, color: '#10b981' },
          { label: 'Daily mean RMSE', value: avgRmse, color: '#a78bfa' },
          { label: 'Daily mean MBE', value: avgMbe, color: '#f59e0b', signed: true },
          { label: 'Daily mean MAPE', value: avgMape, color: '#38bdf8', unit: '%' },
        ].map(({ label, value, color, signed, unit = 'MW' }) => (
          <div key={label} className="glass glass-hover p-4">
            <div className="text-xs mb-2 uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{label}</div>
            {loading ? (
              <div className="skeleton h-7 w-20" />
            ) : value == null ? (
              <span style={{ color: 'var(--text-secondary)' }}>—</span>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold mono" style={{ color }}>
                  {signed && parseFloat(value) > 0 ? '+' : ''}{value}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{unit}</span>
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{loading ? 'Loading daily records' : `${validRows.length} scored delivery days`}</div>
          </div>
        ))}
      </div>

      {/* Daily MAE/RMSE chart */}
      {loading ? (
        <div className="glass skeleton" style={{ height: 300 }} />
      ) : error ? null : !hasData ? (
        <EmptyState message={
          !hasActuals
            ? 'No FUELHH actual generation records are available for these delivery dates.'
            : !hasMatches
              ? 'Actuals are present, but no eligible WINDFOR forecasts matched the January decision cutoffs.'
              : 'No daily accuracy metrics could be calculated for this date range.'
        } />
      ) : (
        <div className="glass p-4">
          <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Daily hourly MAE & RMSE (MW)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(6,13,26,0.97)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              <Bar dataKey="mae" name="MAE" fill={CHART_COLORS.mae} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {chartData.map(row => (
                  <Cell
                    key={row.date}
                    fill={row.date === selectedDeliveryDate.slice(5) || (row.date === 'Feb 1*' && selectedDeliveryDate === '2026-02-01')
                      ? '#6ee7b7'
                      : CHART_COLORS.mae}
                  />
                ))}
              </Bar>
              <Bar dataKey="rmse" name="RMSE" fill={CHART_COLORS.rmse} radius={[3, 3, 0, 0]} maxBarSize={24} fillOpacity={0.7} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mean Bias Error line chart */}
      {hasData && chartData.some(d => d.mbe != null) && (
        <div className="glass p-4">
          <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
            Daily Mean Bias Error (MW) · <span style={{ color: 'var(--danger)', fontSize: 11 }}>positive = overforecast</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(6,13,26,0.97)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="mbe"
                name="MBE"
                stroke={CHART_COLORS.mbe}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.mbe, r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily accuracy table */}
      {rows.length > 0 && !error && (
        <div className="glass overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Daily Accuracy Table</span>
          </div>
          <div className="table-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                  {['Delivery date (UTC)', 'Decision date (UTC)', 'Complete actual hours', 'Incomplete actual hours', 'Missing actual hours', 'Matched hours', 'Unmatched hours', 'Expected-hour coverage', 'MAE (MW)', 'RMSE (MW)', 'MBE (MW)', 'MAPE (%)', 'MAPE samples'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: r.decision_date === decisionDate ? 'rgba(16,185,129,0.09)' : undefined,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td className="px-4 py-2 mono font-medium" style={{ color: 'var(--emerald-bright)' }}>
                      {r.delivery_date === '2026-02-01' ? '2026-02-01* (Feb 1)' : r.delivery_date}
                      {r.decision_date === decisionDate && <span className="ml-2" style={{ color: 'var(--emerald-bright)' }}>Selected</span>}
                    </td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>{r.decision_date}</td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>{r.n_complete_actual ?? 0}</td>
                    <td className="px-4 py-2 mono" style={{ color: r.n_incomplete_actual > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>{r.n_incomplete_actual ?? 0}</td>
                    <td className="px-4 py-2 mono" style={{ color: r.n_missing_actual > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>{r.n_missing_actual ?? 0}</td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>{r.n_matched}</td>
                    <td className="px-4 py-2 mono" style={{ color: r.n_unmatched > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>{r.n_unmatched}</td>
                    <td className="px-4 py-2 mono" style={{ color: coveragePercent(r) < 100 ? 'var(--warning)' : 'var(--emerald-bright)' }}>{coveragePercent(r)}%</td>
                    <td className="px-4 py-2"><MetricBadge value={r.mae_mw} /></td>
                    <td className="px-4 py-2"><MetricBadge value={r.rmse_mw} /></td>
                    <td className="px-4 py-2"><MetricBadge value={r.mbe_mw} positive /></td>
                    <td className="px-4 py-2">
                      {r.mape_pct != null
                        ? <span className="mono" style={{ color: 'var(--info)' }}>{r.mape_pct.toFixed(2)}%</span>
                        : <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      }
                    </td>
                    <td className="px-4 py-2 mono" style={{ color: 'var(--text-secondary)' }}>{r.mape_n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
            Counts and coverage use 24 expected UTC delivery hours per day. A complete FUELHH hour requires both source half-hours; February 1 delivery is evaluated against the January 31 decision cutoff.
          </div>
        </div>
      )}
    </div>
  )
}
