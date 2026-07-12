import MiniCalendar from './MiniCalendar'

// Left navigation: two colour-dot category lists — Tiers and Report Type —
// mirroring the reference calendar app's sidebar. Report TYPE used to live in
// the topbar toggle; that slot is now the Day/Week/Month calendar-view
// switcher, so type filtering moved here next to Tier. Counts reflect the
// currently loaded range + the OTHER axis's filter, so they answer "how many
// for what I'm looking at right now". A mini calendar sits below for jumping
// straight to a date.
function Sidebar({
  sources, activeSource, onSourceSelect,
  tiers, activeTier, tierCounts, onTierSelect,
  types, activeType, typeCounts, onTypeSelect,
  date, onDateChange, title = 'Report Dashboard', subtitle = 'Sunny Thailand',
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">R</div>
        <div className="sidebar-brand-text">
          <div className="sidebar-title">{title}</div>
          <div className="sidebar-subtitle">{subtitle}</div>
        </div>
      </div>

      {sources.length > 0 && <><div className="sidebar-section-label">Report Source</div>
      <nav className="sidebar-nav">
        {sources.map(s => (
          <button
            key={s.key}
            type="button"
            className={`navitem ${s.colorClass}${activeSource === s.key ? ' active' : ''}`}
            aria-pressed={activeSource === s.key}
            onClick={() => onSourceSelect(s.key)}
          >
            <span className="navitem-dot" />
            <span className="navitem-label">{s.label}</span>
          </button>
        ))}
      </nav></>}

      <div className="sidebar-section-label">Tiers</div>
      <nav className="sidebar-nav">
        {tiers.map(t => (
          <button
            key={t.key}
            type="button"
            className={`navitem ${t.colorClass}${activeTier === t.key ? ' active' : ''}`}
            aria-pressed={activeTier === t.key}
            onClick={() => onTierSelect(t.key)}
          >
            <span className="navitem-dot" />
            <span className="navitem-label">{t.label}</span>
            <span className="navitem-count">{tierCounts[t.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-section-label">Report Type</div>
      <nav className="sidebar-nav">
        {types.map(t => (
          <button
            key={t.key || 'all-types'}
            type="button"
            className={`navitem ${t.colorClass}${activeType === t.key ? ' active' : ''}`}
            aria-pressed={activeType === t.key}
            onClick={() => onTypeSelect(t.key)}
          >
            <span className="navitem-dot" />
            <span className="navitem-label">{t.label}</span>
            <span className="navitem-count">{typeCounts[t.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-section-label">Jump to Date</div>
      <MiniCalendar date={date} onDateChange={onDateChange} />
    </aside>
  )
}

export default Sidebar
