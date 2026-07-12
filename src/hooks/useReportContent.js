import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Detail query — fetches the heavy HTML for a SINGLE report, lazily, only when
// a card is opened. This is the other half of the over-fetch fix: the multi-MB
// payload is pulled once per click instead of for every row on every load.
export function useReportContent(id, source = 'reports', reportDate = null) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) {
      setContent(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    // Fetch ONLY the columns the viewer renders. Recent pipeline rows initially
    // land in PRE_computed_Data, so it is the template-rendering fallback. This
    // remains a lazy, single-report query; both languages stay available so tab
    // switching is instant (no refetch).
    //
    // DEPLOY ORDER: requires report_data_eng/thai to exist — run
    // sql/phase2_report_data.sql before shipping this. After Phase C drops
    // html_content_*, remove those two names from the select below.
    const table = source === 'gold' ? 'GOLD_reports'
      : source === 'resort' ? 'reports_resort'
      : 'reports'
    const columns = source === 'gold'
      ? 'id, PRE_computed_Data, PRE_computed_Data_thai, html_content_eng, html_content_thai'
      : 'id, PRE_computed_Data, report_data_eng, report_data_thai, html_content_eng, html_content_thai'

    supabase
      .from(table)
      .select(columns)
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setContent(source === 'gold' ? {
          ...data,
          report_data_eng: data.PRE_computed_Data,
          report_data_thai: data.PRE_computed_Data_thai,
        } : data)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [id, source, reportDate])

  return { content, loading, error }
}
