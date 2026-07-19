import { useState, useEffect, useRef, useCallback } from 'react'
import { renderGoldSentimentDashboard, renderReport } from '../lib/renderReport'

// Appends a small nav script to the raw HTML string without touching the DOM.
// Does NOT modify any existing element IDs — only assigns IDs to headings that
// have none, so the report's own scripts can still find their elements.
function injectNavScript(html) {
  if (!html) return ''

  const script = `
<script>
;(function () {
  'use strict';
  var _navIdx = 0;
  var _debounce;

  function collectHeadings() {
    var out = [];
    // Collect .layer-hdr (section group titles, e.g. "Executive Snapshot") and
    // .section elements (individual sections, e.g. "Market Pulse") in DOM order.
    var nodes = document.querySelectorAll('.layer-hdr, .section');
    nodes.forEach(function (el) {
      var text, level;
      if (el.classList.contains('layer-hdr')) {
        var t = el.querySelector('.layer-hdr-title');
        if (!t) return;
        text = (t.textContent || '').trim();
        level = 1;
      } else {
        var t = el.querySelector('.section-title');
        if (!t) return;
        text = (t.textContent || '').trim();
        level = 2;
      }
      if (!text || /^loading/i.test(text)) return;
      if (!el.id) el.id = '_nav_' + (_navIdx++);
      out.push({ id: el.id, text: text, level: level });
    });
    return out;
  }

  function postHeadings() {
    var h = collectHeadings();
    if (h.length) {
      try { window.parent.postMessage({ type: 'navHeadings', headings: h }, '*'); } catch (_) {}
    }
  }

  // Scroll command from parent sidebar
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'navScrollTo') {
      var el = document.getElementById(e.data.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Send headings once initial load is done, then watch for dynamic changes
  window.addEventListener('load', function () {
    postHeadings();

    var obs = new MutationObserver(function () {
      clearTimeout(_debounce);
      _debounce = setTimeout(postHeadings, 350);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Stop watching after 10 s — content should be settled by then
    setTimeout(function () { obs.disconnect(); }, 10000);
  });
})();
<\/script>`

  // Insert just before </body> so it runs after the report's own scripts
  return html.includes('</body>')
    ? html.replace(/<\/body>/i, script + '</body>')
    : html + script
}

function ReportViewer({ report, content, contentLoading, source, onClose }) {
  // Tabs render immediately from the metadata flags; the actual HTML arrives
  // lazily via `content` (fetched only when this report was opened).
  const hasPrecomputed = Boolean(content?.PRE_computed_Data)
  const isGoldSentiment = Boolean(content?.goldSentiment)
  // The competitor template ships its own Thai translation, so a raw
  // PRE_computed_Data payload can always be viewed in Thai chrome even when
  // the pipeline wrote no Thai-specific columns.
  const hasThai = Boolean(
    report?.has_thai || content?.report_data_thai || content?.html_content_thai
  ) || hasPrecomputed

  // No English tab in this dashboard: open in Thai whenever a Thai version
  // exists; English renders only for English-only reports (no tabs shown).
  const [tab, setTab] = useState(report?.has_thai ? 'thai' : 'eng')
  const activeTab = tab
  const [headings,    setHeadings]    = useState([])
  const [activeId,    setActiveId]    = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [srcDoc,      setSrcDoc]      = useState('')
  const [rendering,   setRendering]   = useState(false)
  const iframeRef = useRef(null)

  // Reset when a new report is opened
  useEffect(() => {
    setTab(report?.has_thai ? 'thai' : 'eng')
    setHeadings([])
    setActiveId(null)
    setSidebarOpen(false)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [report?.id])

  // Reset sidebar when switching language tab
  useEffect(() => {
    setHeadings([])
    setActiveId(null)
    setSidebarOpen(false)
  }, [tab])

  // Receive headings posted from inside the iframe
  useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === 'navHeadings' && Array.isArray(e.data.headings)) {
        setHeadings(e.data.headings)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const scrollTo = useCallback((id) => {
    setActiveId(id)
    setSidebarOpen(false)
    iframeRef.current?.contentWindow?.postMessage({ type: 'navScrollTo', id }, '*')
  }, [])

  // Build srcdoc lazily when the fetched content arrives or the tab switches.
  // Prefer the compact report_data_* (rendered against the shipped template);
  // fall back to a stored html_content_* blob for legacy rows.
  useEffect(() => {
    if (!content) { setSrcDoc(''); return }

    if (content.goldSentiment) {
      setRendering(false)
      setSrcDoc(injectNavScript(renderGoldSentimentDashboard(
        report?.report_date, content.rows
      )))
      return
    }

    // Thai priority: real translated data, then a stored Thai HTML blob (data
    // stays null so the html branch below runs), then the language-neutral
    // pipeline payload rendered with the template's built-in Thai chrome.
    const data = activeTab === 'eng'
      ? (content.report_data_eng ?? content.PRE_computed_Data)
      : (content.report_data_thai
          ?? (content.html_content_thai ? null : content.PRE_computed_Data))
    const html = activeTab === 'eng' ? content.html_content_eng : content.html_content_thai

    let cancelled = false

    if (data) {
      setRendering(true)
      renderReport(data, { source, language: activeTab === 'thai' ? 'thai' : 'eng' })
        .then(full => { if (!cancelled) setSrcDoc(injectNavScript(full)) })
        .catch(() => {
          // Template render failed — fall back to legacy HTML if present.
          if (!cancelled) setSrcDoc(html ? injectNavScript(html) : '')
        })
        .finally(() => { if (!cancelled) setRendering(false) })
    } else {
      setRendering(false)
      setSrcDoc(html ? injectNavScript(html) : '')
    }

    return () => { cancelled = true }
  }, [content, activeTab, report?.report_date, source])

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="viewer-overlay" onClick={handleOverlayClick}>
      <div className="viewer">

        {/* Header */}
        <div className="viewer-header">
          {headings.length > 0 && (
            <button
              className="viewer-sidebar-toggle"
              onClick={() => setSidebarOpen(prev => !prev)}
              aria-label="Toggle contents"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <rect x="2" y="4"  width="16" height="2" rx="1"/>
                <rect x="2" y="9"  width="16" height="2" rx="1"/>
                <rect x="2" y="14" width="16" height="2" rx="1"/>
              </svg>
            </button>
          )}

          <div className="viewer-title">{report?.run_id}</div>

          {!isGoldSentiment && hasThai && (
            <div className="viewer-tabs">
              <button
                className={`viewer-tab ${activeTab === 'thai' ? 'active' : ''}`}
                onClick={() => setTab('thai')}
              >
                Thai
              </button>
            </div>
          )}

          <button className="viewer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="viewer-body">

          {/* Backdrop — tapping outside the drawer closes it on mobile */}
          {sidebarOpen && (
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Sidebar — shown once headings arrive via postMessage */}
          {headings.length > 0 && (
            <nav className={`viewer-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
              <div className="sidebar-heading">Contents</div>
              {headings.map(h => (
                <button
                  key={h.id}
                  className={`sidebar-item level-${h.level}${activeId === h.id ? ' sidebar-active' : ''}`}
                  title={h.text}
                  onClick={() => scrollTo(h.id)}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}

          <div className="viewer-content">
            {(contentLoading || rendering) ? (
              <div className="state-message">
                <div className="spinner" />
                <div>Loading report…</div>
              </div>
            ) : srcDoc ? (
              <iframe
                key={`${report?.id}-${activeTab}`}
                ref={iframeRef}
                className="viewer-iframe"
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                title={activeTab === 'eng' ? 'English Report' : 'Thai Report'}
              />
            ) : (
              <div className="viewer-no-content">No content for this language.</div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default ReportViewer
