import { useState, useEffect, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight, CalendarDays, ChevronDown } from 'lucide-react'
import { fetchExplorer } from '../api'
import { SectionHeader, EmptyState, ErrorState, hasForecastMatch } from '../components'
import { formatUtc, shiftIsoDate } from '../dateUtils'

const DELIVERY_DATES = Array.from({ length: 31 }, (_, i) => shiftIsoDate('2026-01-02', i))

export default function DataExplorer({ decisionDate, deliveryDate, cutoffTime, onDecisionDateChange }) {
  const [request, setRequest] = useState({ key: null, status: 'idle' })
  const [offset, setOffset] = useState(0)
  const [filterText, setFilterText] = useState('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerRef = useRef(null)
  const PAGE_SIZE = 50
  const requestKey = `${deliveryDate}|${decisionDate}|${cutoffTime}|${offset}`

  useEffect(() => {
    if (!datePickerOpen) return undefined

    const closeOnOutsideClick = event => {
      if (!datePickerRef.current?.contains(event.target)) setDatePickerOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setDatePickerOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [datePickerOpen])

  useEffect(() => {
    let active = true
    setRequest({ key: requestKey, status: 'loading' })
    fetchExplorer(deliveryDate, decisionDate, cutoffTime, PAGE_SIZE, offset)
      .then(data => { if (active) setRequest({ key: requestKey, status: 'success', data }) })
      .catch(e => {
        if (active) setRequest({ key: requestKey, status: 'error', error: e.response?.data?.detail || e.message })
      })
    return () => { active = false }
  }, [deliveryDate, decisionDate, cutoffTime, offset, requestKey])

  function handleDatePickerKeyDown(event) {
    if (event.target.id === 'explorer-date-select' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setDatePickerOpen(true)
      requestAnimationFrame(() => datePickerRef.current?.querySelector('[aria-selected="true"]')?.focus())
      return
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = Array.from(datePickerRef.current?.querySelectorAll('[role="option"]') ?? [])
    const currentIndex = options.indexOf(document.activeElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)))
    event.preventDefault()
    options[nextIndex]?.focus()
  }

  const isCurrent = request.key === requestKey
  const loading = !isCurrent || request.status === 'loading'
  const error = isCurrent && request.status === 'error' ? request.error : null
  const data = isCurrent && request.status === 'success' ? request.data : null
  const rows = data?.data ?? []
  const total = data?.total ?? 0

  const filtered = filterText
    ? rows.filter(r =>
        String(r.start_time).includes(filterText) ||
        String(r.actual_mw).includes(filterText) ||
        (r.forecast_mw != null && String(r.forecast_mw).includes(filterText))
      )
    : rows

  return (
    <div className="space-y-5 max-w-7xl">
      <SectionHeader
        title="Data Explorer"
        sub="Inspect hourly delivery records with forecast vintages and UTC publication timestamps"
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`date-picker-shell ${datePickerOpen ? 'is-open' : ''}`} ref={datePickerRef} onKeyDown={handleDatePickerKeyDown}>
          <label id="explorer-date-label" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Delivery date:</label>
          <button
            id="explorer-date-select"
            type="button"
            aria-labelledby="explorer-date-label"
            aria-haspopup="listbox"
            aria-expanded={datePickerOpen}
            aria-controls="explorer-date-options"
            onClick={() => setDatePickerOpen(open => !open)}
            className="date-picker-trigger text-xs rounded-lg px-3 py-2 mono"
            style={{
              background: 'rgba(16,185,129,0.09)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
            }}
          >
            <CalendarDays size={14} />
            <span>{deliveryDate}{deliveryDate === '2026-02-01' ? ' · Jan 31 decision' : ''}</span>
            <ChevronDown size={14} className={datePickerOpen ? 'rotate-180' : ''} />
          </button>
          {datePickerOpen && (
            <div
              id="explorer-date-options"
              role="listbox"
              aria-label="Delivery date"
              className="date-picker-options"
            >
              {DELIVERY_DATES.map(date => {
                const selected = date === deliveryDate
                return (
                  <button
                    id={`delivery-date-${date}`}
                    key={date}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      onDecisionDateChange(shiftIsoDate(date, -1))
                      setOffset(0)
                      setDatePickerOpen(false)
                    }}
                    className="date-picker-option"
                    style={{
                      color: selected ? 'var(--emerald-bright)' : 'var(--text-primary)',
                      background: selected ? 'rgba(16,185,129,0.14)' : 'transparent',
                    }}
                  >
                    <span>{date}</span>
                    {date === '2026-02-01' && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Jan 31 decision</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1" style={{ maxWidth: 280 }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            id="explorer-filter"
            placeholder="Filter by time or MW value…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="date-summary text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
          Decision: <span className="mono" style={{ color: 'var(--text-secondary)' }}>{decisionDate}</span>
          {' · '}Cutoff: <span className="mono" style={{ color: 'var(--text-secondary)' }}>{cutoffTime} UTC</span>
          {total > 0 && <span> · {total} records</span>}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="glass data-loading" aria-label="Loading delivery periods">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-full" />
        </div>
      ) : !error && filtered.length === 0 ? (
        <EmptyState message={total === 0 ? 'No data for this delivery date' : 'No rows match filter'} />
      ) : !error && (
        <div className="glass overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.25)' }}>
                  {[
                    'Delivery hour (UTC)', 'FUELHH hourly mean MW', 'WINDFOR forecast MW', 'Error (F−A) MW',
                    'Forecast published (UTC)', 'Status'
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const forecastAvailable = r.forecast_available === true && hasForecastMatch(r)
                  const matched = r.matched === true
                  const errorAbs = r.error_mw != null ? Math.abs(r.error_mw) : null
                  const errorColor = errorAbs == null ? 'var(--text-muted)'
                    : errorAbs < 500 ? 'var(--emerald)' : errorAbs < 1500 ? 'var(--warning)' : 'var(--danger)'
                  const status = matched
                    ? 'Matched'
                    : r.actual_incomplete
                      ? 'Incomplete actual'
                      : !r.actual_available
                        ? 'No actual data'
                        : forecastAvailable
                          ? 'Not matched'
                          : 'No eligible forecast'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="px-4 py-2.5 mono" style={{ color: 'var(--text-secondary)' }}>
                        {formatUtc(r.start_time, 'datetime-year')}
                      </td>
                      <td className="px-4 py-2.5 mono font-medium" style={{ color: 'var(--info)' }}>
                        {r.actual_mw != null
                          ? r.actual_mw.toLocaleString()
                          : r.actual_incomplete
                            ? `Incomplete (${r.actual_source_periods}/2)`
                            : 'No actual'}
                      </td>
                      <td className="px-4 py-2.5 mono" style={{ color: forecastAvailable ? 'var(--emerald)' : 'var(--text-muted)' }}>
                        {forecastAvailable ? Number(r.forecast_mw).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 mono font-medium" style={{ color: errorColor }}>
                        {r.error_mw != null ? (r.error_mw > 0 ? '+' : '') + r.error_mw.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 mono" style={{ color: 'var(--text-secondary)' }}>
                        {r.publish_time ? `${formatUtc(r.publish_time, 'datetime-year')} UTC` : 'No eligible forecast'}
                      </td>
                      <td className="px-4 py-2.5" style={{
                        color: matched
                          ? 'var(--emerald-bright)'
                          : r.actual_incomplete || !r.actual_available || !forecastAvailable
                            ? 'var(--warning)'
                            : 'var(--text-secondary)',
                      }}>
                        {status}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  id="explorer-prev"
                  disabled={offset === 0}
                  onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
                  style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--emerald)', border: '1px solid var(--border)' }}
                >
                  <ChevronLeft size={12} /> Prev
                </button>
                <button
                  id="explorer-next"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(o => o + PAGE_SIZE)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-40"
                  style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--emerald)', border: '1px solid var(--border)' }}
                >
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
