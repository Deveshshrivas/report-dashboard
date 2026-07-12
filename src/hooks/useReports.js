import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// List query — metadata ONLY. The big html_content_*/report_data_* columns are
// never fetched here; we read has_eng/has_thai flags from the lightweight
// `reports_meta` view instead. This keeps a dashboard load cheap (no multi-MB
// egress, no de-TOASTing large columns on every mount).
//
// We also bound the query SERVER-SIDE by the selected date window and a hard
// safety LIMIT, so the work the DB does does NOT grow with total history — only
// with the size of the window you're looking at. Tier/report-type filtering
// stays client-side (cheap, operates on this already-small result).
const MAX_ROWS = 1000

const SOURCE_TABLES = {
  reports: 'reports_meta',
  gold: 'GOLD_reports',
  resort: 'reports_resort',
}

export function useReports(dateFrom, dateTo, source = 'reports') {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      // Test Supabase connection
      if (source === 'reports') {
        console.log('[TEST] Querying reports_meta table...')
        const testQuery = await supabase.from('reports_meta').select('id, run_id, created_at').limit(3)
        console.log('[TEST] Supabase response:', testQuery)
        if (testQuery.error) {
          console.error('[TEST] ✗ SUPABASE ERROR:', testQuery.error.message)
          return
        } else {
          console.log('[TEST] ✓ Supabase connected! Found', testQuery.data?.length, 'reports')
          console.log('[TEST] Sample data:', testQuery.data?.[0])
        }
      }

      let query = supabase
        .from(SOURCE_TABLES[source] ?? SOURCE_TABLES.reports)
        .select(source === 'reports'
          ? 'id, run_id, status, report_type, created_at, has_eng, has_thai'
          : 'id, run_id, status, report_type, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS)

      // Resort uses run_id (YYYY-MM-DD) as the report's logical date. Multiple
      // pipeline attempts may share that date, so fetch metadata first and
      // deduplicate after the query instead of filtering by insertion time.
      if (source === 'resort') {
        const { data, error } = await query
        if (cancelled) return
        if (error) setError(error.message)
        else {
          const latestByDate = new Map()
          for (const row of data ?? []) {
            const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(row.run_id ?? '')
              ? row.run_id : String(row.created_at ?? '').slice(0, 10)
            if ((!dateFrom || reportDate >= dateFrom) && (!dateTo || reportDate <= dateTo)
                && !latestByDate.has(reportDate)) {
              latestByDate.set(reportDate, {
                ...row,
                created_at: `${reportDate}T00:00:00Z`,
                report_date: reportDate,
              })
            }
          }
          setReports([...latestByDate.values()])
          setError(null)
        }
        setLoading(false)
        return
      }

      // created_at is a timestamp; the filter inputs are YYYY-MM-DD. Bound to the
      // [dateFrom 00:00, dateTo+1day) half-open range so the whole `dateTo` day is
      // included. Coarse prefilter; App still applies the exact client-side filter.
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo)   query = query.lt('created_at', nextDay(dateTo))

      const { data, error } = await query
      if (cancelled) return
      if (error) setError(error.message)
      else { setReports(data ?? []); setError(null) }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [dateFrom, dateTo, source])

  return { reports, loading, error }
}

// Discover the newest available report date once. The dashboard must not assume
// that "today" already has data (pipeline runs can finish on an earlier day).
// Only the timestamp is fetched, so this remains a tiny metadata request.
export function useLatestReportDate(source = 'reports') {
  const [latest, setLatest] = useState({ source: null, date: null })

  useEffect(() => {
    let cancelled = false

    if (source === 'gold-sentiment') {
      goldSentimentSupabase
        .from(import.meta.env.VITE_GOLD_SENTIMENT_TABLE)
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || error) return
          setLatest({ source, date: data?.report_date ?? null })
        })
      return () => { cancelled = true }
    }

    if (source === 'resort') {
      supabase
        .from(SOURCE_TABLES.resort)
        .select('run_id, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || error) return
          const date = /^\d{4}-\d{2}-\d{2}$/.test(data?.run_id ?? '')
            ? data.run_id : String(data?.created_at ?? '').slice(0, 10)
          setLatest({ source, date: date || null })
        })
      return () => { cancelled = true }
    }

    supabase
      .from(SOURCE_TABLES[source] ?? SOURCE_TABLES.reports)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        setLatest({
          source,
          date: data?.created_at ? String(data.created_at).slice(0, 10) : null,
        })
      })

    return () => { cancelled = true }
  }, [source])

  return latest.source === source ? latest.date : null
}

// 'YYYY-MM-DD' -> 'YYYY-MM-DD' of the following day (UTC-safe, no tz drift).
function nextDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
