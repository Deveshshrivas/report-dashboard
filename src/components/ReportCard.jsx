import { bucketKey, extractTier, formatDate, typeBadge } from '../lib/utils'

const TIER_CLASS = {
  'Tier 1': 'badge-tier-1',
  'Tier 2': 'badge-tier-2',
  'Tier 3': 'badge-tier-3',
  'Uncategorized': 'badge-uncategorized',
}

const STATUS_CLASS = {
  'done': 'badge-done',
  'GENERATING': 'badge-generating',
}

function ReportCard({ report, onClick, style }) {
  const tier = extractTier(report.run_id)
  const type = typeBadge(report)
  // Flags come from the lightweight reports_meta view — the HTML itself is no
  // longer fetched for the list, only when a card is opened.
  const hasEng = Boolean(report.has_eng)
  const hasThai = Boolean(report.has_thai)
  const isGoldSentiment = String(report.id).startsWith('gold-sentiment-')

  return (
    <div
      className={`card card-top-${bucketKey(report)}`}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="card-title">{report.run_id}</div>

      <div className="card-badges">
        <span className={`badge ${type.cls}`}>{type.label}</span>
        {isGoldSentiment ? (
          <span className="badge badge-tier-2">{report.group_count} groups</span>
        ) : (
          <span className={`badge ${TIER_CLASS[tier] ?? 'badge-uncategorized'}`}>
            {tier}
          </span>
        )}
        <span className={`badge ${STATUS_CLASS[report.status] ?? 'badge-status-default'}`}>
          {report.status}
        </span>
      </div>

      <div className="card-date">
        <svg className="card-date-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="11" rx="2"/>
          <path d="M5 1v4M11 1v4M2 7h12"/>
        </svg>
        {formatDate(report.created_at)}
      </div>

      <div className="card-langs">
        <span className={`chip ${hasEng ? 'chip-active' : 'chip-inactive'}`}>
          ENG {hasEng ? '✓' : '–'}
        </span>
        <span className={`chip ${hasThai ? 'chip-active' : 'chip-inactive'}`}>
          THAI {hasThai ? '✓' : '–'}
        </span>
      </div>
    </div>
  )
}

export default ReportCard
