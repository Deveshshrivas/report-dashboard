const TYPE_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', main: 'Main' }

// report_type as emitted by n8n is messy: mixed case ("Daily"/"daily") and the
// occasional trailing newline ("Daily\n"). Normalize to a lowercase, trimmed key.
function normType(report) {
  return (report?.report_type ?? '').trim().toLowerCase()
}

// Which tab a report belongs to. Recognized cadences map 1:1; anything else
// (blank or an unexpected value) falls to the 'main' catch-all.
export function bucketKey(report) {
  const t = normType(report)
  return TYPE_LABELS[t] ? t : 'main'
}

// The type badge shown on each card/row. Known types get their canonical name +
// colour; an UNrecognized type shows its raw value with a distinct "unknown"
// style — so it's visibly flagged rather than silently swallowed into Main.
export function typeBadge(report) {
  const t = normType(report)
  if (TYPE_LABELS[t]) return { cls: `badge-type-${t}`, label: TYPE_LABELS[t] }
  const raw = (report?.report_type ?? '').trim()
  return { cls: 'badge-type-unknown', label: raw ? `? ${raw}` : 'Unknown' }
}

export function extractTier(run_id) {
  if (!run_id) return 'Uncategorized'
  if (/TEIR1/i.test(run_id)) return 'Tier 1'
  if (/TEIR2/i.test(run_id)) return 'Tier 2'
  if (/TEIR3/i.test(run_id)) return 'Tier 3'
  return 'Uncategorized'
}

// Today's date as YYYY-MM-DD in the viewer's LOCAL time (matches the <input type="date">
// format and how a user would pick "today" by hand).
export function todayLocal() {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mo}-${day}`
}

// 'YYYY-MM-DD' -> 'YYYY-MM-DD' shifted by `days` (UTC-safe, no tz drift around midnight).
export function shiftDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Monday-first month grid for the mini calendar, e.g. { label: 'July 2026',
// weeks: [[ '2026-06-29', ..., '2026-07-05' ], ...] } — null cells pad the
// first/last week so every row has exactly 7 slots.
export function getMonthMatrix(ymd) {
  const [y, m] = ymd.slice(0, 7).split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // Mon=0..Sun=6

  const cells = Array(firstWeekday).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { label: `${MONTH_NAMES[m - 1]} ${y}`, weeks }
}

// 'YYYY-MM-DD' (any day-of-month) -> the 1st of the month `delta` months away.
export function shiftMonth(ymd, delta) {
  const [y, m] = ymd.slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// Monday-first week start ('YYYY-MM-DD' -> the Monday of the week containing it).
export function getWeekStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// The 7 dates (Mon-Sun) of the week containing `ymd`.
export function getWeekDates(ymd) {
  const start = getWeekStart(ymd)
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
}

// Last 7 days including the given date (goes back 6 days from the date)
export function getLast7Days(ymd) {
  const start = shiftDate(ymd, -6)
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
}

// Calendar-month bounds (1st to last day) containing `ymd` — bounds the
// month-view Supabase query the same way a single date bounds day view.
export function getMonthRange(ymd) {
  const start = `${ymd.slice(0, 7)}-01`
  const end = shiftDate(shiftMonth(ymd, 1), -1)
  return { start, end }
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function weekdayShort(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`)
  return WEEKDAY_SHORT[(d.getUTCDay() + 6) % 7]
}

export function formatDate(iso) {
  if (!iso) return ''
  // Render the calendar date AS STORED. Parsing the full timestamp and letting
  // toLocaleDateString convert to local time rolls an early-UTC timestamp (or a
  // date-only value, which JS parses as UTC midnight) back by a day for viewers
  // behind UTC. Take the YYYY-MM-DD portion and format it in UTC so the day shown
  // is exactly the day in created_at, the same for every viewer.
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Topbar title for the active calendar view — a single date, a "start – end"
// week span, or a month name, matching what Google Calendar shows as its title.
export function formatRangeLabel(date, view) {
  if (view === 'week') {
    const start = getWeekStart(date)
    return `${formatDate(start)} – ${formatDate(shiftDate(start, 6))}`
  }
  if (view === 'month') return getMonthMatrix(date).label
  return formatDate(date)
}
