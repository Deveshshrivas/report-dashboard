import { normalizeReportData } from './normalizeReport'
import competitorTemplate from '../../Competitor_Report_redesigned_profiles.html?raw'
import goldDashboardTemplate from '../../gold-dashboard-v11.html?raw'

function toObject(reportData) {
  if (reportData == null) return null
  if (typeof reportData === 'string') {
    try { return JSON.parse(reportData) } catch { return null }
  }
  return reportData
}

function toSafeJson(obj) {
  return JSON.stringify(obj)
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<!--/g, '<\\!--')
}

function metaTitle(obj) {
  const title = obj?.meta?.title || obj?.meta?.report_title || 'Competitor Analysis'
  return String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inject a selected Supabase report into Competitor_Report_redesigned_profiles.html.
export async function renderReport(reportData, options = {}) {
  const parsed = toObject(reportData)
  if (!parsed) return ''
  const normalized = normalizeReportData(structuredClone(parsed))
  const safeJson = toSafeJson([{ report_data: normalized }])
  const title = metaTitle(normalized)

  // The template carries its own EN/TH chrome and boots in the language
  // getLangPref() returns. The iframe is sandboxed (opaque origin), so
  // localStorage always throws and the fallback literal decides the language —
  // rewrite both fallbacks so the viewer's tab choice picks the boot language.
  const lang = options.language === 'thai' ? 'th' : 'en'

  return competitorTemplate
    .replace(/(<script id="report-data" type="application\/json">)[\s\S]*?(<\/script>)/i,
      (_match, open, close) => `${open}\n${safeJson}\n${close}`)
    .replace(/(<script id="report-data-th" type="application\/json">)[\s\S]*?(<\/script>)/i,
      (_match, open, close) => `${open}\n${safeJson}\n${close}`)
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(
      "function getLangPref(){ try{ return localStorage.getItem('dc-lang')||'en'; }catch(e){ return 'en'; } }",
      `function getLangPref(){ try{ return localStorage.getItem('dc-lang')||'${lang}'; }catch(e){ return '${lang}'; } }`
    )
}

// Configure gold-dashboard-v11.html with its own read-only Supabase project.
export function renderGoldSentimentDashboard(reportDate, rows = []) {
  const config = {
    url: import.meta.env.VITE_GOLD_SENTIMENT_SUPABASE_URL,
    anonKey: import.meta.env.VITE_GOLD_SENTIMENT_SUPABASE_ANON_KEY,
    table: import.meta.env.VITE_GOLD_SENTIMENT_TABLE,
  }
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(reportDate ?? '') ? reportDate : null
  const embeddedRows = toSafeJson(Array.isArray(rows) ? rows : [])

  let html = goldDashboardTemplate
    .replace(/window\.SUPABASE_CONFIG\s*=\s*\{[\s\S]*?\};/,
      `window.SUPABASE_CONFIG = ${toSafeJson(config)};`)

  // The embedded sample is over 1 MB. Replace it by stable boundary markers
  // instead of a giant regex, which can fail in some browser builds.
  const rowsStart = html.indexOf('window.EMBEDDED_ROWS = ')
  // `$` is the first helper after the embedded assignment; keep it and every
  // helper that follows. Using `let LANG` here would delete those definitions.
  const rowsEnd = html.indexOf('\n  const $ =', rowsStart)
  if (rowsStart >= 0 && rowsEnd > rowsStart) {
    html = html.slice(0, rowsStart)
      + `window.EMBEDDED_ROWS = ${embeddedRows};`
      + html.slice(rowsEnd)
  }

  return html
    .replace('let LANG="th", allRows=[], selectedDate=null;',
      `let LANG="th", allRows=[], selectedDate=${JSON.stringify(safeDate)};`)
    // Embedded rows render immediately. If injection/query ever returns zero,
    // retain the template's original read-only fetch instead of hanging.
    .replace(/\n\s*load\(\);\s*\n<\/script>/,
      '\n  if (!allRows.length) load();\n</script>')
}
