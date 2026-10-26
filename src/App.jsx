import { useState, useEffect } from 'react'
import { Wind, LayoutDashboard, BarChart2, Table2, TrendingUp, ChevronLeft, ChevronRight, AlertCircle, Wifi, WifiOff, Settings } from 'lucide-react'
import sidePanelImg from './assets/SidePanel.png'
import { fetchHealth } from './api'
import Overview from './sections/Overview'
import ForecastAnalysis from './sections/ForecastAnalysis'
import HistoricalAccuracy from './sections/HistoricalAccuracy'
import DataExplorer from './sections/DataExplorer'
import { formatUtc, shiftIsoDate } from './dateUtils'

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'forecast', label: 'Forecast Analysis', icon: TrendingUp },
  { id: 'accuracy', label: 'Historical Accuracy', icon: BarChart2 },
  { id: 'explorer', label: 'Data Explorer', icon: Table2 },
]

const JAN_2026_DATES = Array.from({ length: 31 }, (_, i) => shiftIsoDate('2026-01-01', i))

export default function App() {
  const [section, setSection] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [decisionDate, setDecisionDate] = useState('2026-01-15')
  const [cutoffTime, setCutoffTime] = useState('11:00')
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const deliveryDate = shiftIsoDate(decisionDate, 1)

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealthError(true))
  }, [])

  const SectionComponent = { overview: Overview, forecast: ForecastAnalysis, accuracy: HistoricalAccuracy, explorer: DataExplorer }[section]
  const syncTimes = [health?.last_actual_sync, health?.last_forecast_sync]
    .filter(Boolean)
    .map(value => ({ value, timestamp: new Date(value).getTime() }))
    .filter(item => Number.isFinite(item.timestamp))
  const latestSync = syncTimes.reduce((latest, item) => !latest || item.timestamp > latest.timestamp ? item : latest, null)
  const syncIsStale = latestSync && Date.now() - latestSync.timestamp > 24 * 60 * 60 * 1000

  return (
    <div className="app-shell flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside
        className={`app-sidebar flex-shrink-0 flex flex-col relative ${sidebarOpen ? 'is-open' : 'is-collapsed'}`}
        style={{
          width: sidebarOpen ? 225 : 64,
          background: 'rgba(6,13,26,0.97)',
          borderRight: '1px solid rgba(16,185,129,0.12)',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar hero image */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.18 }}>
          <img src={sidePanelImg} alt="" className="w-full h-full object-cover object-left" />
        </div>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to bottom, rgba(6,13,26,0.6) 0%, rgba(6,13,26,0.85) 100%)'
        }} />

        {/* Logo */}
        <div className="app-sidebar-logo relative flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid rgba(16,185,129,0.1)' }}>
          <div className="flex-shrink-0 w-8 h-8 rounded-lg emerald-gradient flex items-center justify-center">
            <Wind size={16} color="white" />
          </div>
          {sidebarOpen && (
            <div>
              <div className="app-sidebar-label font-bold text-sm leading-none" style={{ color: '#e2e8f0' }}>GridBricks</div>
              <div className="app-sidebar-label text-xs mt-0.5" style={{ color: 'var(--emerald-bright)' }}>Wind Intelligence</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="relative flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = section === id
            return (
              <button
                key={id}
                id={`nav-${id}`}
                onClick={() => setSection(id)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                style={{
                  background: active ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: active ? 'var(--emerald-bright)' : 'var(--text-secondary)',
                  borderLeft: active ? '2px solid var(--emerald)' : '2px solid transparent',
                }}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span className="app-sidebar-label truncate">{label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Status */}
        {sidebarOpen && (
          <div className="app-sidebar-status relative px-3 pb-4">
            <div className="glass p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                {healthError || health?.db_connected === false
                  ? <WifiOff size={12} style={{ color: 'var(--danger)' }} />
                  : <Wifi size={12} style={{ color: health ? 'var(--emerald)' : 'var(--warning)' }} />}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {healthError ? 'Backend offline' : health ? health.db_connected ? 'API available' : 'Database unavailable' : 'Checking API…'}
                </span>
              </div>
              {health && (
                <>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {health.actual_records?.toLocaleString()} actuals
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {health.forecast_records?.toLocaleString()} forecasts
                  </div>
                  <div style={{ color: syncIsStale ? 'var(--warning)' : 'var(--text-secondary)' }}>
                    {latestSync
                      ? `${syncIsStale ? 'Sync older than 24h' : 'Last sync'} ${formatUtc(latestSync.value, 'datetime-year')} UTC`
                      : 'Last sync time unavailable'}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="relative w-full flex items-center justify-center py-3 transition-colors"
          style={{ borderTop: '1px solid rgba(16,185,129,0.1)', color: 'var(--text-muted)' }}
          id="sidebar-toggle"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>

      {/* Main content */}
      <div className="app-main flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="app-header flex-shrink-0 flex items-center justify-between px-5 gap-4" style={{
          background: 'rgba(6,13,26,0.9)',
          borderBottom: '1px solid rgba(16,185,129,0.1)',
          backdropFilter: 'blur(12px)',
        }}>
          <div className="relative flex items-center gap-4">
            <div>
              <h1 className="font-semibold text-base leading-none" style={{ color: 'var(--text-primary)' }}>
                {NAV.find(n => n.id === section)?.label}
              </h1>
              <div className="header-context mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Elexon BMRS · January 2026
                <span className="header-sync">
                  {' · '}
                  {healthError
                    ? 'API unavailable'
                    : latestSync
                      ? `${syncIsStale ? 'Stale sync' : 'Last sync'} ${formatUtc(latestSync.value, 'datetime-year')} UTC`
                      : 'Sync time unavailable'}
                </span>
              </div>
            </div>
          </div>

          <div className="app-header-controls relative flex items-center gap-3">
            {/* Decision date */}
            <div className="flex items-center gap-2">
              <label htmlFor="decision-date-select" className="text-xs" style={{ color: 'var(--text-secondary)' }}>Decision:</label>
              <select
                id="decision-date-select"
                value={decisionDate}
                onChange={e => setDecisionDate(e.target.value)}
                className="text-xs rounded-lg px-2 py-1.5 outline-none"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid var(--border-bright)',
                  color: 'var(--emerald-bright)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {JAN_2026_DATES.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="delivery-summary text-xs px-2" style={{ color: 'var(--text-secondary)' }}>→ Delivery: <span className="mono" style={{ color: 'var(--text-primary)' }}>{deliveryDate}</span></div>

            {/* Settings */}
            <button
              id="settings-btn"
              onClick={() => setShowSettings(s => !s)}
              aria-label="Decision cutoff settings"
              aria-expanded={showSettings}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)', background: showSettings ? 'rgba(16,185,129,0.1)' : 'transparent' }}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Settings panel */}
        {showSettings && (
          <div className="app-settings flex-shrink-0 px-6 py-3 flex items-center gap-4 text-xs" style={{
            background: 'rgba(16,185,129,0.05)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Decision cutoff (UTC):</span>
            <select
              id="cutoff-select"
              value={cutoffTime}
              onChange={e => setCutoffTime(e.target.value)}
              className="rounded-lg px-2 py-1 mono outline-none"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: 'var(--emerald)' }}
            >
              {['09:00','10:00','11:00','12:00','13:00','14:00'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span style={{ color: 'var(--text-secondary)' }}>
              Default: 11:00 UTC — day-ahead market gate closure approximation. Configurable via DECISION_CUTOFF_TIME env var.
            </span>
          </div>
        )}

        {/* Health banner */}
        {healthError && (
          <div className="flex-shrink-0 flex items-center gap-2 px-6 py-2 text-xs" style={{
            background: 'rgba(244,63,94,0.1)',
            borderBottom: '1px solid rgba(244,63,94,0.2)',
            color: 'var(--danger)',
          }}>
            <AlertCircle size={14} />
            Backend API unavailable. Start with: <code className="mono px-1">cd backend && uvicorn main:app --reload</code>
          </div>
        )}

        {/* Data coverage note */}
        {health && health.actual_records === 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 px-6 py-2 text-xs" style={{
            background: 'rgba(245,158,11,0.1)',
            borderBottom: '1px solid rgba(245,158,11,0.2)',
            color: 'var(--warning)',
          }}>
            <AlertCircle size={14} />
            No data synced yet. Run: <code className="mono px-1">cd backend && python sync.py</code>
          </div>
        )}

        {/* Content */}
        <main className="app-content-scroll flex-1 overflow-auto p-5">
          <SectionComponent
            decisionDate={decisionDate}
            deliveryDate={deliveryDate}
            cutoffTime={cutoffTime}
            health={health}
            onDecisionDateChange={setDecisionDate}
          />
        </main>
      </div>
    </div>
  )
}
