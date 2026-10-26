// Reusable UI primitives
import { formatUtc } from './dateUtils'

export function KpiCard({ label, value, unit, sub, color = 'var(--emerald)', icon: Icon, loading }) {
  return (
    <div className="kpi-card glass glass-hover p-4 flex flex-col">
      <div className="kpi-card-heading flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {Icon && <Icon size={16} style={{ color }} />}
      </div>
      {loading ? (
        <div className="skeleton h-8 w-24" />
      ) : value == null ? (
        <span className="text-lg" style={{ color: 'var(--text-secondary)' }}>—</span>
      ) : (
        <div className="kpi-card-value flex items-baseline gap-1">
          <span className="text-2xl font-bold mono" style={{ color }}>{value}</span>
          {unit && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
        </div>
      )}
      {sub && <div className="kpi-card-sub text-xs" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )
}

export function SectionHeader({ title, sub }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {sub && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  )
}

export function EmptyState({ message = 'No data available' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-secondary)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.08)' }}>
        <span className="text-2xl">📭</span>
      </div>
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function ErrorState({ message }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg text-sm" style={{
      background: 'rgba(244,63,94,0.08)',
      border: '1px solid rgba(244,63,94,0.2)',
      color: 'var(--danger)',
    }}>
      ⚠ {message}
    </div>
  )
}

export function Badge({ children, color = 'var(--emerald)' }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>{children}</span>
  )
}

export const CHART_COLORS = {
  forecast: '#10b981',
  actual: '#38bdf8',
  error: '#f59e0b',
  grid: 'rgba(255,255,255,0.05)',
  tooltip: { bg: 'rgba(6,13,26,0.95)', border: 'rgba(16,185,129,0.3)' },
}

export function hasForecastMatch(row) {
  return row?.forecast_mw != null
    && row.forecast_mw !== ''
    && Number.isFinite(Number(row.forecast_mw))
}

export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  const timestampLabel = typeof label === 'number'
    ? label
    : typeof label === 'string' && /^\d{13}$/.test(label) ? Number(label) : null
  const displayLabel = timestampLabel == null
    ? label
    : `${formatUtc(new Date(timestampLabel).toISOString(), 'datetime-year')} UTC`
  return (
    <div className="glass px-3 py-2 text-xs" style={{ minWidth: 180 }}>
      <div className="font-medium mb-1 mono" style={{ color: 'var(--text-secondary)' }}>{displayLabel}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span style={{ color: p.color || p.stroke }}>●</span>
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="font-medium mono" style={{ color: 'var(--text-primary)' }}>
            {p.value != null ? `${Number(p.value).toLocaleString()} MW` : '—'}
          </span>
        </div>
      ))}
      {row?.forecastAvailable === false && (
        <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>
          No eligible hourly forecast for this delivery hour
        </div>
      )}
      {row?.actualAvailable === false && row?.actualIncomplete && (
        <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>
          Incomplete FUELHH hour: {row.actual_source_periods}/2 half-hour source periods
        </div>
      )}
    </div>
  )
}
