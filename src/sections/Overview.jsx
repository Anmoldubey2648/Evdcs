import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Wind, Zap, Target, TrendingUp, AlertCircle, Clock3 } from 'lucide-react'
import { fetchDailyAccuracy, fetchKPIs, fetchTimeseries } from '../api'
import { KpiCard, EmptyState, ErrorState, CustomTooltip, CHART_COLORS, hasForecastMatch } from '../components'
import mainUpImg from '../assets/mainUp.png'
import { formatUtc } from '../dateUtils'

export default function Overview({ decisionDate, deliveryDate, cutoffTime }) {
  const [overviewRequest, setOverviewRequest] = useState({ key: null, status: 'idle' })
  const [dailyRequest, setDailyRequest] = useState({ key: null, status: 'idle' })
  const requestKey = `${decisionDate}|${deliveryDate}|${cutoffTime}`
  const dailyRequestKey = cutoffTime

  useEffect(() => {
    let active = true
    setOverviewRequest({ key: requestKey, status: 'loading' })

    Promise.all([
      fetchKPIs(decisionDate, deliveryDate, cutoffTime),
      fetchTimeseries(decisionDate, deliveryDate, cutoffTime),
    ])
      .then(([nextKpis, nextSeries]) => {
        if (!active) return
        setOverviewRequest({ key: requestKey, status: 'success', kpis: nextKpis, series: nextSeries })
      })
      .catch(e => {
        if (active) setOverviewRequest({ key: requestKey, status: 'error', error: e.response?.data?.detail || e.message })
      })

    return () => { active = false }
  }, [decisionDate, deliveryDate, cutoffTime, requestKey])

  useEffect(() => {
    let active = true
    setDailyRequest({ key: dailyRequestKey, status: 'loading' })

    fetchDailyAccuracy(cutoffTime)
      .then(result => {
        if (active) setDailyRequest({ key: dailyRequestKey, status: 'success', data: result })
      })
      .catch(e => {
        if (active) setDailyRequest({ key: dailyRequestKey, status: 'error', error: e.response?.data?.detail || e.message })
      })

    return () => { active = false }
  }, [cutoffTime, dailyRequestKey])

  const overviewIsCurrent = overviewRequest.key === requestKey
  const loading = !overviewIsCurrent || overviewRequest.status === 'loading'
  const error = overviewIsCurrent && overviewRequest.status === 'error' ? overviewRequest.error : null
  const kpis = overviewIsCurrent && overviewRequest.status === 'success' ? overviewRequest.kpis : null
  const series = overviewIsCurrent && overviewRequest.status === 'success' ? overviewRequest.series : null
  const dailyIsCurrent = dailyRequest.key === dailyRequestKey
  const dailyAccuracyLoading = !dailyIsCurrent || dailyRequest.status === 'loading'
  const dailyAccuracyError = dailyIsCurrent && dailyRequest.status === 'error' ? dailyRequest.error : null
  const dailyAccuracy = dailyIsCurrent && dailyRequest.status === 'success' ? dailyRequest.data : null
  const rows = series?.data ?? []
  const chartData = rows
    .map(row => ({
      ...row,
      time: formatUtc(row.start_time, 'time'),
      timestamp: Date.parse(row.start_time),
      forecast: hasForecastMatch(row) ? Number(row.forecast_mw) : null,
      actual: row.actual_mw == null || !Number.isFinite(Number(row.actual_mw))
        ? null
        : Number(row.actual_mw),
      matched: row.matched === true,
      actualIncomplete: row.actual_incomplete === true,
    }))
    .filter(row => Number.isFinite(row.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
  const chartTicks = chartData
    .filter((_, index) => index % 6 === 0 || index === chartData.length - 1)
    .map(row => row.timestamp)
  const matchedPeriods = chartData.filter(row => row.matched).length
  const incompleteActualHours = chartData.filter(row => row.actualIncomplete).length
  const selectedPublications = rows
    .map(row => row.publish_time)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  const selectedPublication = selectedPublications[0]
  const noActuals = !loading && !error
    && (kpis?.n_complete_actual ?? 0) === 0
    && (kpis?.n_incomplete_actual ?? 0) === 0
    && (kpis?.n_missing_actual ?? 0) === (kpis?.total_hours ?? 24)
  const dailyRows = (dailyAccuracy?.data ?? []).filter(row =>
    row.decision_date >= '2026-01-01' && row.decision_date <= '2026-01-31'
  )
  const scoredDays = dailyRows.filter(row => row.mae_mw != null)
  const dailyAverage = key => {
    const values = scoredDays.map(row => row[key]).filter(value => value != null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }
  const totalActuals = dailyRows.reduce(
    (sum, row) => sum + (row.n_expected ?? 24),
    0,
  )
  const totalMatched = dailyRows.reduce((sum, row) => sum + (row.n_matched ?? 0), 0)
  const dailyChartData = dailyRows
    .filter(row => row.mae_mw != null)
    .map(row => ({
      date: row.delivery_date === '2026-02-01' ? 'Feb 1*' : row.delivery_date.slice(8),
      deliveryDate: row.delivery_date,
      mae: row.mae_mw,
      rmse: row.rmse_mw,
    }))

  return (
    <div className="app-content">
      <section className="overview-hero relative overflow-hidden rounded-2xl">
        <img src={mainUpImg} alt="" className="overview-hero-image absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(90deg, rgba(4,14,22,0.91) 0%, rgba(4,14,22,0.72) 48%, rgba(5,24,26,0.27) 100%), linear-gradient(0deg, rgba(4,14,22,0.4), transparent 62%)',
        }} />
        <div className="overview-hero-content relative flex h-full items-center justify-between gap-6 p-7">
          <div className="max-w-3xl">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--emerald-bright)' }}>
              Real data. Real insights. A greener tomorrow.
            </p>
            <h1 className="overview-hero-title text-3xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>
              UK <span style={{ color: 'var(--emerald-bright)' }}>Wind Power</span> Forecast Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: '#d0dce2' }}>
              Make informed electricity purchasing decisions with historical Elexon forecasts,
              actual generation and transparent accuracy analysis.
            </p>
          </div>
          <div className="overview-date-badge min-w-48 rounded-xl border p-4 backdrop-blur-md" style={{
            background: 'rgba(5, 18, 27, 0.72)', borderColor: 'rgba(205, 231, 228, 0.2)',
          }}>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Decision → delivery</div>
            <div className="mono mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {decisionDate} → {deliveryDate}
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Cutoff <span className="mono" style={{ color: 'var(--emerald-bright)' }}>{cutoffTime} UTC</span>
            </div>
          </div>
        </div>
      </section>

      {error && <ErrorState message={error} />}

      <div className="kpi-grid grid gap-4">
        <KpiCard
          label="Forecast generation"
          value={kpis?.avg_forecast_mw?.toLocaleString() ?? null}
          unit="MW"
          color="var(--emerald-bright)"
          icon={Wind}
          loading={loading}
          sub="Mean across matched hourly periods"
        />
        <KpiCard
          label="Actual generation"
          value={kpis?.avg_actual_mw?.toLocaleString() ?? null}
          unit="MW"
          color="var(--info)"
          icon={Zap}
          loading={loading}
          sub="Mean of two FUELHH half-hours per matched hour"
        />
        <KpiCard
          label="Mean absolute error"
          value={kpis?.mae_mw?.toLocaleString() ?? null}
          unit="MW"
          color="var(--warning)"
          icon={Target}
          loading={loading}
          sub="MAE · lower is better"
        />
        <KpiCard
          label="Root mean square error"
          value={kpis?.rmse_mw?.toLocaleString() ?? null}
          unit="MW"
          color="#b6a1ff"
          icon={TrendingUp}
          loading={loading}
          sub="RMSE · penalizes larger errors"
        />
        <KpiCard
          label="Mean bias"
          value={kpis?.mbe_mw != null ? `${kpis.mbe_mw > 0 ? '+' : ''}${kpis.mbe_mw.toLocaleString()}` : null}
          unit="MW"
          color={kpis?.mbe_mw > 0 ? 'var(--danger)' : 'var(--emerald-bright)'}
          loading={loading}
          sub={kpis?.mbe_mw == null
            ? 'Mean forecast minus actual'
            : kpis.mbe_mw > 0
              ? 'Overforecast · forecast − actual'
              : kpis.mbe_mw < 0
                ? 'Underforecast · forecast − actual'
                : 'No mean bias'}
        />
        <KpiCard
          label="Mean absolute percentage error"
          value={kpis?.mape_pct != null ? kpis.mape_pct : kpis?.mape_undefined ? 'N/A' : null}
          unit={kpis?.mape_pct != null ? '%' : ''}
          color="var(--info)"
          loading={loading}
          sub={kpis?.mape_undefined ? 'Undefined: all actuals are zero' : `From ${kpis?.mape_n ?? '—'} non-zero actuals`}
        />
        <KpiCard
          label="Matched hours"
          value={kpis?.n_matched ?? null}
          unit={`/ ${kpis?.total_hours ?? '—'} hours`}
          color="var(--emerald-bright)"
          loading={loading}
          sub={`${kpis?.coverage_pct ?? '—'}% of expected delivery hours matched`}
        />
        <KpiCard
          label="Forecast missing hours"
          value={kpis?.n_forecast_missing ?? null}
          color={kpis?.n_forecast_missing > 0 ? 'var(--warning)' : 'var(--emerald-bright)'}
          icon={AlertCircle}
          loading={loading}
          sub="No eligible WINDFOR vintage by cutoff"
        />
      </div>

      {noActuals && <EmptyState message="No actual generation records are available for this delivery date." />}

      {(loading || rows.length > 0) && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="glass min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Forecast vs actual generation</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Delivery {deliveryDate} · hourly forecast vs mean of two FUELHH half-hours
                </p>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Shared generation axis</span>
            </div>
            {loading ? (
              <div className="skeleton h-[280px]" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    label={{ value: 'Generation (MW)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
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
                    dataKey="forecast"
                    name="Forecast (WINDFOR hourly)"
                    stroke={CHART_COLORS.forecast}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS.forecast, stroke: 'var(--bg-base)', strokeWidth: 1.5 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {!loading && !error && rows.length > 0 && (
              <p className="mt-2 text-xs" style={{ color: incompleteActualHours ? 'var(--warning)' : 'var(--text-secondary)' }}>
                {matchedPeriods}/{kpis?.total_hours ?? chartData.length} expected delivery hours matched.
                {incompleteActualHours > 0 && ` ${incompleteActualHours} actual hours are incomplete because one or both half-hour source periods are missing.`}
                {(kpis?.n_missing_actual ?? 0) > 0 && ` ${kpis.n_missing_actual} expected hours have no FUELHH source records.`}
              </p>
            )}
          </section>

          <aside className="glass flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <Clock3 size={17} style={{ color: 'var(--emerald-bright)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Forecast publication</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Only publications available at or before the configured decision cutoff are eligible.
            </p>
            <div className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'var(--border)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Latest selected publication</div>
              <div className="mono mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {loading ? 'Loading…' : selectedPublication ? `${formatUtc(selectedPublication, 'datetime-year')} UTC` : 'No eligible forecast'}
              </div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'var(--border)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Decision cutoff</div>
              <div className="mono mt-2 text-sm font-semibold" style={{ color: 'var(--emerald-bright)' }}>{decisionDate} · {cutoffTime} UTC</div>
            </div>
            <p className="mt-auto text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {loading ? 'Checking source coverage…' : `${kpis?.n_matched ?? 0} of ${kpis?.total_hours ?? 24} expected hourly periods matched. ${kpis?.n_incomplete_actual ?? 0} incomplete actual hours are excluded.`}
            </p>
          </aside>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>January decision accuracy</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Daily delivery errors at the {cutoffTime} UTC decision cutoff · selected decision highlighted
          </p>
        </div>
        {dailyAccuracyError && <ErrorState message={dailyAccuracyError} />}
        {dailyAccuracyLoading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="glass skeleton h-[280px]" />
            <div className="glass skeleton h-[280px]" />
          </div>
        ) : dailyAccuracyError ? null : scoredDays.length === 0 ? (
          <EmptyState message="No matched forecast and actual periods are available for January decision dates." />
        ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <section className="glass min-w-0 overflow-hidden">
              <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Accuracy summary</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Mean of {scoredDays.length} scored delivery days · {totalMatched.toLocaleString()} / {totalActuals.toLocaleString()} expected hourly periods matched
                  {totalActuals > 0 ? ` (${(totalMatched / totalActuals * 100).toFixed(1)}%)` : ''}
                </p>
              </div>
              <div className="table-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {['Metric', 'Daily mean', 'Interpretation'].map(title => (
                        <th key={title} className="px-4 py-2.5 text-left font-medium">{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Mean Absolute Error (MAE)', value: dailyAverage('mae_mw'), unit: 'MW', note: 'Lower is better' },
                      { label: 'Root Mean Square Error (RMSE)', value: dailyAverage('rmse_mw'), unit: 'MW', note: 'Lower is better' },
                      { label: 'Mean Bias Error (MBE)', value: dailyAverage('mbe_mw'), unit: 'MW', note: 'Positive = overforecast' },
                      { label: 'Mean Absolute Percentage Error', value: dailyAverage('mape_pct'), unit: '%', note: 'Daily mean; zero actuals excluded' },
                    ].map(metric => (
                      <tr key={metric.label}>
                        <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{metric.label}</td>
                        <td className="px-4 py-3 mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {metric.value == null ? 'N/A' : `${metric.value.toFixed(2)} ${metric.unit}`}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{metric.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="glass min-w-0 p-4">
              <div className="mb-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Daily forecast error</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>MAE and RMSE in MW · Feb 1 delivery is marked*</p>
              </div>
              <ResponsiveContainer width="100%" height={232}>
                <BarChart data={dailyChartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'rgba(6,13,26,0.97)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    formatter={(value, name) => [`${Number(value).toFixed(2)} MW`, name]}
                  />
                  <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 11 }} />
                  <Bar dataKey="mae" name="MAE" fill={CHART_COLORS.forecast} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                    {dailyChartData.map(row => (
                      <Cell
                        key={`mae-${row.deliveryDate}`}
                        fill={row.deliveryDate === deliveryDate ? '#a7f3d0' : CHART_COLORS.forecast}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="rmse" name="RMSE" fill="#9b87ed" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                    {dailyChartData.map(row => (
                      <Cell
                        key={`rmse-${row.deliveryDate}`}
                        fill={row.deliveryDate === deliveryDate ? '#c4b5fd' : '#9b87ed'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>
        )}
      </section>

      <div className="glass p-4">
        <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Methodology and coverage</div>
        <ul className="space-y-1.5 pl-4 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', listStyle: 'disc' }}>
          <li>Forecast source: WINDFOR. Actual generation source: FUELHH, both from Elexon BMRS.</li>
          <li>The latest forecast publication at or before the decision cutoff is selected independently for each hourly delivery start; later publications are excluded.</li>
          <li>Error is forecast minus actual. MAPE excludes zero-actual periods and is undefined when no non-zero actuals are available.</li>
          <li>Hourly actuals are the mean of both FUELHH half-hours starting within that UTC hour. Hours missing either source period are not scored; missing values remain blank and count against coverage.</li>
        </ul>
      </div>
    </div>
  )
}
