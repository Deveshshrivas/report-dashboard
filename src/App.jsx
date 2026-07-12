import { useEffect, useMemo, useState } from 'react'
import { useLatestReportDate, useReports } from './hooks/useReports'
import { useReportContent } from './hooks/useReportContent'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import FilterBar from './components/FilterBar'
import StatCards from './components/StatCards'
import CalendarBoard from './components/CalendarBoard'
import ReportViewer from './components/ReportViewer'
import {
  extractTier, bucketKey, todayLocal, shiftDate, shiftMonth,
  getWeekDates, getMonthRange, formatRangeLabel, getLast7Days,
} from './lib/utils'
import './index.css'

const TYPES = [
  { key: '', label: 'All Types', colorClass: 'col-all' },
  { key: 'daily', label: 'Daily', colorClass: 'col-daily' },
  { key: 'weekly', label: 'Weekly', colorClass: 'col-weekly' },
  { key: 'monthly', label: 'Monthly', colorClass: 'col-monthly' },
  { key: 'main', label: 'Main', colorClass: 'col-main' },
]

const TIERS = [
  { key: 'all', label: 'All Tiers', colorClass: 'col-all' },
  { key: 'Tier 1', label: 'Tier 1', colorClass: 'col-tier1' },
  { key: 'Tier 2', label: 'Tier 2', colorClass: 'col-tier2' },
  { key: 'Tier 3', label: 'Tier 3', colorClass: 'col-tier3' },
]

const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

const PORTALS = {
  compi: {
    source: 'reports', title: 'Compi Dashboard', short: 'Compi',
    description: 'Tier-based competitor intelligence reports', icon: 'C', theme: 'compi',
  },
  gold: {
    source: 'gold', title: 'Gold Dashboard', short: 'Gold',
    description: 'Gold-market competitor reports and analysis', icon: 'G', theme: 'gold',
  },
  resort: {
    source: 'resort', title: 'Resort Dashboard', short: 'Resort',
    description: 'Date-based hospitality and resort reports', icon: 'R', theme: 'resort',
  },
  sentiment: {
    source: 'gold-sentiment', title: 'Gold Sentiment Dashboard', short: 'Gold Sentiment',
    description: 'Date-based Facebook group sentiment intelligence', icon: 'S', theme: 'sentiment',
  },
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-mark">R</div>
        <p className="auth-eyebrow">Report Intelligence</p>
        <h1>Welcome back</h1>
        <p className="auth-copy">Sign in to access the Compi, Gold, and Resort dashboards.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  )
}


function Dashboard({ portal, onBack, onLogout, standalone = false }) {
  const source = portal.source
  const [anchorDate, setAnchorDate] = useState(null)
  const latestReportDate = useLatestReportDate(source)
  const date = anchorDate ?? latestReportDate ?? todayLocal()
  const [view, setView] = useState('day')
  const [tier, setTier] = useState('')
  const [reportType, setReportType] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [rangeStartDate, setRangeStartDate] = useState(null)
  const [rangeEndDate, setRangeEndDate] = useState(null)

  const range = useMemo(() => {
    // For week/month views, always use automatic range (ignore manual selection)
    if (view === 'week') {
      // Show 7 days: current date + 6 days before
      const last7 = getLast7Days(date)
      return { from: last7[0], to: last7[6] }
    }
    if (view === 'month') {
      const { start, end } = getMonthRange(date)
      return { from: start, to: end }
    }
    // For day view, use manual range if set, otherwise single day
    if (rangeStartDate && rangeEndDate) {
      return { from: rangeStartDate, to: rangeEndDate }
    }
    return { from: date, to: date }
  }, [view, date, rangeStartDate, rangeEndDate])

  const { reports, loading, error } = useReports(range.from, range.to, source)
  const filtered = useMemo(() => reports.filter(report => {
    if (tier && extractTier(report.run_id) !== tier) return false
    if (reportType && bucketKey(report) !== reportType) return false
    return true
  }), [reports, tier, reportType])

  const tierCounts = useMemo(() => {
    const counts = { all: 0, 'Tier 1': 0, 'Tier 2': 0, 'Tier 3': 0 }
    for (const report of reports) {
      if (reportType && bucketKey(report) !== reportType) continue
      counts.all += 1
      const reportTier = extractTier(report.run_id)
      if (reportTier in counts) counts[reportTier] += 1
    }
    return counts
  }, [reports, reportType])

  const typeCounts = useMemo(() => {
    const counts = { '': 0, daily: 0, weekly: 0, monthly: 0, main: 0 }
    for (const report of reports) {
      if (tier && extractTier(report.run_id) !== tier) continue
      counts[''] += 1
      counts[bucketKey(report)] += 1
    }
    return counts
  }, [reports, tier])

  function stepDate(direction) {
    setAnchorDate(current => {
      current ??= date
      if (view === 'week') return shiftDate(current, direction * 7)
      if (view === 'month') return shiftMonth(current, direction)
      return shiftDate(current, direction)
    })
  }

  function jumpToDate(nextDate) {
    setAnchorDate(nextDate)
    setView('day')
  }

  const selected = reports.find(report => report.id === selectedId) ?? null
  const { content, loading: contentLoading } = useReportContent(selectedId, source, selected?.report_date ?? null)

  return (
    <div className={`app-shell dashboard-${portal.theme}`}>
      <Sidebar
        sources={[]}
        activeSource={source}
        onSourceSelect={() => {}}
        tiers={TIERS}
        activeTier={tier || 'all'}
        tierCounts={tierCounts}
        onTierSelect={key => setTier(key === 'all' ? '' : key)}
        types={TYPES}
        activeType={reportType}
        typeCounts={typeCounts}
        onTypeSelect={setReportType}
        date={date}
        onDateChange={jumpToDate}
        title={portal.title}
        subtitle={`${portal.short} reports`}
      />
      <div className="main-col">
        <header className="topbar dashboard-topbar">
          <div className="topbar-left"><span className="dashboard-name">{portal.title}</span><h1 className="topbar-title">{formatRangeLabel(date, view)}</h1><span className="topbar-sub">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span></div>
          <div className="topbar-actions">
            <div className="typetoggle">{VIEWS.map(item => <button key={item.key} type="button" className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</div>
            <button className="dashboard-signout" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        <div className="board-wrap">
          {error && <div className="error-msg">Error: {error}</div>}
          <StatCards reports={filtered} />
          <FilterBar
            date={date}
            onDateChange={setAnchorDate}
            onStep={stepDate}
            resultCount={filtered.length}
            rangeStartDate={rangeStartDate}
            rangeEndDate={rangeEndDate}
            onRangeChange={(start, end) => {
              setRangeStartDate(start)
              setRangeEndDate(end)
            }}
            onClearRange={() => {
              setRangeStartDate(null)
              setRangeEndDate(null)
            }}
          />
          {loading ? (
            <div className="cal-single cal-skeleton"><div className="cal-rail" /><div className="cal-lane">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card card-skeleton"><div className="sk sk-line" style={{ width: '70%' }} /><div className="sk sk-line" style={{ width: '40%' }} /></div>)}</div></div>
          ) : rangeStartDate && rangeEndDate ? (
            <div style={{ padding: '20px', maxHeight: '600px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '10px', fontSize: '14px', color: '#888' }}>
                Showing {filtered.length} report{filtered.length !== 1 ? 's' : ''} from {rangeStartDate} to {rangeEndDate}
              </div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  No reports in this date range
                </div>
              ) : (
                filtered.map(report => (
                  <div
                    key={report.id}
                    onClick={() => setSelectedId(report.id)}
                    style={{
                      padding: '12px 16px',
                      marginBottom: '8px',
                      border: '1px solid #2a3a4a',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: '#1a2332',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2a3a4a'
                      e.currentTarget.style.borderColor = '#4a6a8a'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#1a2332'
                      e.currentTarget.style.borderColor = '#2a3a4a'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>{report.run_id}</div>
                        <div style={{ fontSize: '12px', color: '#aaa' }}>
                          {report.report_type} • Status: {report.status}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {new Date(report.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <CalendarBoard view={view} date={date} reports={filtered} onSelect={setSelectedId} onDrillDay={jumpToDate} />
          )}
        </div>
      </div>
      {selectedId && selected && <ReportViewer report={selected} content={content} contentLoading={contentLoading} source={source} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
  }

  if (session === undefined) return <div className="app-loading"><div className="spinner" /><span>Loading…</span></div>
  if (!session) return <LoginPage />
  return <Dashboard portal={PORTALS.compi} onBack={() => {}} onLogout={logout} />
}

export default App
