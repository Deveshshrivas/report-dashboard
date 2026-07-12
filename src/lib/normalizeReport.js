// Frontend port of the n8n "Inject into HTML Template" normalization (v10 + AUTO-HEAL).
// The report template's render script expects this normalized shape; the DB stores the
// RAW precomputed data, so the dashboard runs this before injecting into the template.
// Keep this in sync with the n8n inject code node (everything from the SAFE HELPERS down
// to the end of FIX 6 — the template build itself lives in report-template.html).
//
// cwaOutput: optional client_weakness_analysis object. If the stored report_data already
// carries reportData.client_weakness_analysis, you don't need to pass it.
export function normalizeReportData(reportData, cwaOutput) {
  if (!reportData) return reportData;
  if (cwaOutput && cwaOutput.client_name) reportData.client_weakness_analysis = cwaOutput;

  // ─────────────────────────────────────────────────────
  // SAFE HELPERS
  // ─────────────────────────────────────────────────────
  function safeArr(v) {
    if (!v) return [];
    if (Array.isArray(v)) {
      if (v.length && Array.isArray(v[0])) return v.flat();
      return v;
    }
    return [v];
  }

  function safeObj(v) {
    if (!v) return {};
    if (Array.isArray(v)) return v[0] || {};
    return v;
  }

  function safeNum(v, fallback) {
    const n = Number(v);
    return isNaN(n) ? (fallback || 0) : n;
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-HEAL LAYER — fixes recurring input defects generically.
  // Touches DATA ONLY. Template, CSS, charts are untouched.
  // ═══════════════════════════════════════════════════════════════
  (function autoHeal() {
    // 1. Treat literal junk strings as empty ("null"/"undefined"/"N/A" → "").
    const JUNK = new Set(['null', 'undefined', 'nan', 'none', 'n/a', '-', '—']);
    function scrub(node, depth) {
      if (depth > 12 || node == null) return node;
      if (typeof node === 'string') {
        const t = node.trim();
        return JUNK.has(t.toLowerCase()) ? '' : t;
      }
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) node[i] = scrub(node[i], depth + 1);
        return node;
      }
      if (typeof node === 'object') {
        for (const k in node) {
          if (Object.prototype.hasOwnProperty.call(node, k)) {
            node[k] = scrub(node[k], depth + 1);
          }
        }
        return node;
      }
      return node;
    }
    scrub(reportData, 0);

    // 2. Generic self-wrapper unwrap ({ market_leader: { market_leader: [...] } }).
    function unwrapSelf(parent, key) {
      if (!parent || parent[key] == null) return;
      let v = parent[key];
      let guard = 0;
      while (v && typeof v === 'object' && !Array.isArray(v)
             && v[key] !== undefined && guard < 5) {
        v = v[key];
        guard++;
      }
      parent[key] = v;
    }
    ['market_leader', 'insight_cards', 'challengers',
     'competitors', 'competitors_ranked', 'deep_dives'].forEach(k => unwrapSelf(reportData, k));

    // 3. Normalize collection shapes (array-or-object → expected shape).
    function toArr(v) {
      if (!v) return [];
      if (Array.isArray(v)) return (v.length && Array.isArray(v[0])) ? v.flat() : v;
      return [v];
    }
    function toFirstObj(v) {
      if (!v) return {};
      if (Array.isArray(v)) return v[0] || {};
      return v;
    }
    reportData.market_leader = toFirstObj(reportData.market_leader);
    reportData.insight_cards = toArr(reportData.insight_cards);
    reportData.challengers = toArr(reportData.challengers);
    reportData.deep_dives = toArr(reportData.deep_dives);
    reportData.competitors_ranked = toArr(reportData.competitors_ranked);
    if (reportData.competitors) reportData.competitors = toArr(reportData.competitors);

    // 4. Coerce count-like fields to real numbers.
    const NUM_KEYS = ['total_ads', 'total_posts', 'ads', 'posts',
                      'total_competitors', 'active_advertisers',
                      'inactive_advertisers', 'total_active_ads',
                      'median_engagement', 'threat', 'threat_score',
                      'count', 'total', 'weighted_total', 'competitors',
                      'score', 'car', 'img', 'vid', 'pct', 'percentage'];
    function coerce(node, depth) {
      if (depth > 12 || node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(n => coerce(n, depth + 1)); return; }
      for (const k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        const val = node[k];
        if (NUM_KEYS.includes(k) && typeof val === 'string' && val.trim() !== '') {
          const n = Number(val);
          if (!isNaN(n)) node[k] = n;
        } else if (val && typeof val === 'object') {
          coerce(val, depth + 1);
        }
      }
    }
    coerce(reportData, 0);

    // 5. Screenshot URL: normalize blank/whitespace to null so template gates stay clean.
    toArr(reportData.deep_dives).forEach(d => {
      ['screenshot_url', 'ads_library_screenshot_url', 'fb'].forEach(k => {
        if (d[k] != null && String(d[k]).trim() === '') d[k] = null;
      });
    });
  })();

  // ─────────────────────────────────────────────────────
  // FIX 0 — Normalize META field names
  // ─────────────────────────────────────────────────────
  {
    const m = reportData.meta || {};
    if (!m.title)             m.title           = m.report_title || 'Competitor Analysis';
    if (!m.subtitle)          m.subtitle        = (m.industry || '') + ' · Paid Ads + Organic Posts Analysis';
    if (!m.date)              m.date            = m.run_date
                                                    ? new Date(m.run_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                                    : '';
    if (!m.region)            m.region          = m.market || '';
    if (!m.analyst)           m.analyst         = '';
    if (!m.data_source)       m.data_source     = 'Meta Ad Library + Facebook Pages';
    if (!m.competitors_count) m.competitors_count = m.total_competitors || 0;
    reportData.meta = m;
  }

  // ─────────────────────────────────────────────────────
  // FIX 0b — Normalize KPI field names
  // ─────────────────────────────────────────────────────
  {
    const k = reportData.kpis || {};
    if (k.total_active_ads === undefined) k.total_active_ads = k.total_ads || 0;
    if (k.active_pct === undefined && k.active_advertisers && k.total_competitors) {
      k.active_pct = Math.round((k.active_advertisers / k.total_competitors) * 100);
    }
    if (k.active_pct === undefined) k.active_pct = 0;
    if (k.inactive_advertisers === undefined) {
      k.inactive_advertisers = safeNum(k.total_competitors) - safeNum(k.active_advertisers);
    }
    reportData.kpis = k;
  }

  // ─────────────────────────────────────────────────────
  // FIX 0c — Normalize CHARTS field names
  // ─────────────────────────────────────────────────────
  {
    const c = reportData.charts || {};
    const dives = safeArr(reportData.deep_dives);
    const groupBy = (items, keyFn, valueFn) => {
      const grouped = new Map();
      items.forEach(item => {
        const key = String(keyFn(item) || '').trim();
        if (!key) return;
        const current = grouped.get(key) || { total: 0, names: [] };
        current.total += safeNum(valueFn ? valueFn(item) : 1, 1);
        if (item.name && !current.names.includes(item.name)) current.names.push(item.name);
        grouped.set(key, current);
      });
      return [...grouped].map(([name, value]) => ({ name, ...value, competitors: value.names.length }));
    };

    // Some pipelines store complete per-competitor deep dives but leave the
    // aggregate chart arrays empty. Rebuild those arrays from the fetched rows
    // so the template shows the available database data instead of zero cards.
    if (!safeArr(c.ad_volume).length) {
      c.ad_volume = dives
        .map(d => ({ name: d.name, ads: safeNum(d.total_ads || d.ads) }))
        .filter(x => x.name && x.ads > 0)
        .sort((a, b) => b.ads - a.ads);
    }
    if (!c.ads_hook_distribution && c.hook_distribution) c.ads_hook_distribution = c.hook_distribution;
    if (!c.ads_intent_distribution && c.intent_distribution) c.ads_intent_distribution = c.intent_distribution;
    if (!c.post_volume || !c.post_volume.length) {
      c.post_volume = dives
        .filter(d => safeNum(d.total_posts || d.posts) > 0)
        .map(d => ({ name: d.name, posts: safeNum(d.total_posts || d.posts), confidence: d.post_confidence || 'LOW' }))
        .sort((a, b) => b.posts - a.posts);
    }
    if (!safeArr(c.formats_per_competitor).length) {
      c.formats_per_competitor = dives.map(d => {
        const f = d.format_distribution || {};
        return {
          name: d.name,
          ads: safeNum(d.total_ads || d.ads),
          img: safeNum(f.image), vid: safeNum(f.video), car: safeNum(f.carousel),
        };
      }).filter(x => x.name);
    }
    if (!safeArr(c.format_distribution).length || safeArr(c.format_distribution).every(x => safeNum(x.percentage) === 0)) {
      const totals = { Image: 0, Video: 0, Carousel: 0 };
      dives.forEach(d => {
        const f = d.format_distribution || {};
        const ads = Math.max(1, safeNum(d.total_ads || d.ads));
        totals.Image += safeNum(f.image) * ads;
        totals.Video += safeNum(f.video) * ads;
        totals.Carousel += safeNum(f.carousel) * ads;
      });
      const total = totals.Image + totals.Video + totals.Carousel;
      if (total > 0) c.format_distribution = Object.entries(totals).map(([format, value]) => ({
        format, percentage: Math.round(value / total * 100), competitors: dives.length,
      }));
    }
    if (!safeArr(c.hook_distribution).length) {
      c.hook_distribution = groupBy(
        dives.filter(d => safeNum(d.total_ads || d.ads) > 0),
        d => d.paid_snapshot?.dominant_hook,
        d => safeNum(d.total_ads || d.ads, 1),
      ).map(x => ({ hook: x.name, total: x.total, competitors: x.competitors, names: x.names }));
    }
    if (!safeArr(c.intent_distribution).length) {
      const paidIntent = d => {
        const text = `${d.paid_snapshot?.key_tactic || ''} ${d.strategy_en || ''}`.toLowerCase();
        if (/book|lead|convert|offer|price|discount|promotion|sale/.test(text)) return 'conversion';
        if (/educat|trust|proof|review|explain|consider/.test(text)) return 'consideration';
        return 'awareness';
      };
      c.intent_distribution = groupBy(
        dives.filter(d => safeNum(d.total_ads || d.ads) > 0), paidIntent,
        d => safeNum(d.total_ads || d.ads, 1),
      ).map(x => ({ intent: x.name, total: x.total, competitors: x.competitors, names: x.names }));
    }
    if (!safeArr(c.posts_hook_distribution).length) {
      c.posts_hook_distribution = groupBy(
        dives.filter(d => safeNum(d.total_posts || d.posts) > 0),
        d => d.organic_snapshot?.dominant_hook,
        () => 1,
      ).map(x => ({ ...x, weighted_total: x.total }));
    }
    if (!safeArr(c.post_categories).length) {
      c.post_categories = groupBy(
        dives.filter(d => safeNum(d.total_posts || d.posts) > 0),
        d => d.organic_snapshot?.top_category,
        () => 1,
      ).map(x => ({ ...x, weighted_total: x.total }));
    }
    if (!safeArr(c.post_formats).length) {
      c.post_formats = groupBy(
        dives.filter(d => safeNum(d.total_posts || d.posts) > 0),
        d => d.organic_snapshot?.top_format,
        () => 1,
      ).map(x => ({ ...x, weighted_total: x.total }));
    }
    if (!safeArr(c.posts_intent_distribution).length) {
      const organicIntent = d => {
        const text = `${d.organic_snapshot?.top_category || ''} ${d.key_observation || ''}`.toLowerCase();
        if (/promo|discount|offer|price|sale/.test(text)) return 'Promotion';
        if (/review|question|community|engage|contest/.test(text)) return 'Engagement';
        return 'Awareness';
      };
      c.posts_intent_distribution = groupBy(
        dives.filter(d => safeNum(d.total_posts || d.posts) > 0), organicIntent, () => 1,
      ).map(x => ({ ...x, weighted_total: x.total }));
    }
    if (!safeArr(c.service_landscape).length) {
      const services = [];
      dives.forEach(d => safeArr(d.business_positioning?.services).forEach(service => {
        services.push({ name: d.name, service });
      }));
      c.service_landscape = groupBy(services, x => x.service, () => 1)
        .map(x => ({ name: x.name, service: x.name, count: x.total, mentions: x.total, competitors: x.competitors, names: x.names }));
    }
    reportData.charts = c;
  }

  // ─────────────────────────────────────────────────────
  // FIX 0d — Rebuild REMOVED sections from market_insights
  // ─────────────────────────────────────────────────────
  {
    const mi = reportData.market_insights || {};
    if (!reportData.threats || !reportData.threats.length) {
      const t = [];
      safeArr(mi.oversaturated_zones).slice(0, 3).forEach(z => t.push({ text_en: z }));
      safeArr(mi.hook_gaps).slice(0, 2).forEach(g => t.push({ text_en: g }));
      reportData.threats = t.slice(0, 5);
    }
    if (!reportData.opportunities || !reportData.opportunities.length) {
      const o = [];
      safeArr(mi.format_gaps).slice(0, 2).forEach(g => o.push({ text_en: g }));
      safeArr(mi.segment_gaps).slice(0, 2).forEach(g => o.push({ text_en: g }));
      safeArr(mi.hook_gaps).slice(0, 1).forEach(g => o.push({ text_en: g }));
      reportData.opportunities = o.slice(0, 5);
    }
  }

  // FIX: Normalize market_leader / insight_cards / challengers shapes
  reportData.market_leader = safeObj(reportData.market_leader);
  reportData.insight_cards = safeArr(reportData.insight_cards);
  reportData.challengers = safeArr(reportData.challengers);

  // ─────────────────────────────────────────────────────
  // FIX 0e — Move narratives into layer2
  // ─────────────────────────────────────────────────────
  {
    const l2 = reportData.layer2 || {};
    if (!l2.posts_narrative_en && reportData.posts_narrative) l2.posts_narrative_en = reportData.posts_narrative;
    if (!l2.cluster_insight_en && reportData.cluster_insight) l2.cluster_insight_en = reportData.cluster_insight;
    if (!l2.service_bundling_en) {
      const parts = [l2.offer_landscape_en, l2.platform_strategy_en].filter(Boolean);
      l2.service_bundling_en = parts.join('\n\n') || '';
    }
    if (!l2.seasonal_analysis_en) {
      const mi = reportData.market_insights || {};
      const zones = safeArr(mi.oversaturated_zones);
      l2.seasonal_analysis_en = zones.length ? zones.join(' • ') : '';
    }
    if (!l2.white_space_cards || !l2.white_space_cards.length) {
      const mi = reportData.market_insights || {};
      const cards = [];
      safeArr(mi.format_gaps).slice(0, 2).forEach(g => {
        const parts = g.split(':'); cards.push({ title_en: (parts[0] || 'Format Gap').trim().substring(0, 65), body_en: g.substring(0, 250), priority: 'high' });
      });
      safeArr(mi.segment_gaps).slice(0, 2).forEach(g => {
        const parts = g.split(':'); cards.push({ title_en: (parts[0] || 'Segment Gap').trim().substring(0, 65), body_en: g.substring(0, 250), priority: 'medium' });
      });
      safeArr(mi.hook_gaps).slice(0, 1).forEach(g => {
        const parts = g.split(':'); cards.push({ title_en: (parts[0] || 'Hook Gap').trim().substring(0, 65), body_en: g.substring(0, 250), priority: 'medium' });
      });
      l2.white_space_cards = cards.slice(0, 4);
    }
    reportData.layer2 = l2;
  }

  // ─────────────────────────────────────────────────────
  // FIX 1 — Build strategy_chart from hook distributions
  // ─────────────────────────────────────────────────────
  if (!reportData.charts) reportData.charts = {};
  if (!reportData.charts.strategy_chart || !reportData.charts.strategy_chart.length) {
    const stratMap = {};
    safeArr(reportData.charts.ads_hook_distribution).forEach(h => {
      const name = String(h.hook || '').charAt(0).toUpperCase() + String(h.hook || '').slice(1).replace(/_/g, ' ');
      stratMap[name] = (stratMap[name] || 0) + safeNum(h.total);
    });
    safeArr(reportData.charts.posts_hook_distribution).forEach(h => {
      const name = String(h.name || h.hook || '');
      stratMap[name] = (stratMap[name] || 0) + safeNum(h.weighted_total || h.total);
    });
    reportData.charts.strategy_chart = Object.entries(stratMap)
      .map(([name, count]) => ({ name, count }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  // ─────────────────────────────────────────────────────
  // FIX 2 — Build competitors[] from competitors_ranked
  // ─────────────────────────────────────────────────────
  if (!reportData.competitors || !reportData.competitors.length) {
    reportData.competitors = safeArr(reportData.competitors_ranked).map(c => {
      const matchingDD = safeArr(reportData.deep_dives).find(d => d.name === c.name);
      const realFb = matchingDD?.fb || matchingDD?.ads_library_screenshot_url;
      return {
        name:        c.name || '',
        ads:         safeNum(c.total_ads || c.ads),
        posts:       safeNum(c.total_posts || c.posts),
        tier:        c.positioning_tier || c.tier || 'inactive',
        strategy_en: (c.master_strategy_bullets && c.master_strategy_bullets.length)
                       ? c.master_strategy_bullets[0]
                       : '',
        usp_en:      c.key_usp || c.usp_en || '',
        fb:          realFb
                       || 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TH&q=' + encodeURIComponent(c.name || ''),
      };
    });
  }

  // ─────────────────────────────────────────────────────
  // FIX 3 — Fix market_leader field names (now guaranteed object)
  // ─────────────────────────────────────────────────────
  if (reportData.market_leader) {
    const ml = reportData.market_leader;
    if (!ml.usp_en && ml.key_usp) ml.usp_en = ml.key_usp;
    if (!ml.target_en) {
      const mlProfile = safeArr(reportData.deep_dives).find(d => d.name === ml.name);
      if (mlProfile) ml.target_en = mlProfile.target || '';
    }
    if (!ml.what_en) {
      const mlProfile = safeArr(reportData.deep_dives).find(d => d.name === ml.name);
      if (mlProfile) {
        ml.what_en = mlProfile.key_observation || (mlProfile.organic_snapshot && mlProfile.organic_snapshot.standout_post) || '';
      }
    }
    if (!ml.strategy_en && ml.master_strategy_bullets && ml.master_strategy_bullets.length) {
      ml.strategy_en = ml.master_strategy_bullets[0];
    }
  }

  // ─────────────────────────────────────────────────────
  // FIX 4 — Fix challenger field names
  // ─────────────────────────────────────────────────────
  safeArr(reportData.challengers).forEach(c => {
    if (!c.usp_en && c.key_usp) c.usp_en = c.key_usp;
    if (!c.usp_en) c.usp_en = '';
    if (c.ads === undefined) c.ads   = safeNum(c.total_ads);
    if (c.posts === undefined) c.posts = safeNum(c.total_posts);
  });

  // ─────────────────────────────────────────────────────
  // FIX 5 — Normalize deep_dives
  // ─────────────────────────────────────────────────────
  const _priceMap = {};
  safeArr(reportData.charts.price_signals).forEach(p => {
    if (!_priceMap[p.competitor]) _priceMap[p.competitor] = [];
    _priceMap[p.competitor].push(p.signal);
  });

  safeArr(reportData.deep_dives).forEach(d => {
    if (d.threat === undefined) d.threat = safeNum(d.threat_score);
    if (!d.threatLevel) {
      const sev = String(d.severity || '').toUpperCase();
      if (sev === 'CRITICAL')                    d.threatLevel = 'high';
      else if (sev === 'HIGH')                   d.threatLevel = 'high';
      else if (sev === 'MEDIUM')                 d.threatLevel = 'medium';
      else if (sev === 'LOW')                    d.threatLevel = 'low';
      else                                       d.threatLevel = 'minimal';
    }
    if (!d.usp_en)     d.usp_en    = d.usp     || d.key_usp      || '';
    if (!d.target_en)  d.target_en = d.target  || '';
    if (!d.strategy_en) {
      if (d.post_strategy) {
        d.strategy_en = d.post_strategy;
      } else if (d.master_strategy_bullets && d.master_strategy_bullets.length) {
        d.strategy_en = d.master_strategy_bullets.join(' · ');
      } else {
        d.strategy_en = '';
      }
    }
    if (d.ads   === undefined) d.ads   = safeNum(d.total_ads);
    if (d.posts === undefined) d.posts = safeNum(d.total_posts);
    if (d.engagement === undefined) {
      if (d.median_engagement != null) {
        d.engagement = String(d.median_engagement) + ' median';
      } else {
        const avgEng = (d.organic_snapshot && d.organic_snapshot.avg_engagement != null)
          ? d.organic_snapshot.avg_engagement
          : null;
        d.engagement = avgEng != null ? String(avgEng) + ' avg' : 'N/A';
      }
    }
    if (d.discounts === undefined) {
      d.discounts = (d.paid_snapshot && d.paid_snapshot.promotion_style)
        ? d.paid_snapshot.promotion_style
        : 'N/A';
    }
    if (d.price === undefined) {
      const sigs = _priceMap[d.name];
      d.price = sigs && sigs.length ? sigs.join(' | ') : 'No pricing data';
    }
    if (d.positioning === undefined) {
      d.positioning = d.tier || d.positioning_tier || 'N/A';
    }
    if (!d.what_en) {
      d.what_en = d.key_observation
        || (d.organic_snapshot && d.organic_snapshot.standout_post)
        || '';
    }
    // Use real Supabase URL if available, fallback to keyword search only as last resort
    if (!d.fb || d.fb === null || d.fb === '') {
      d.fb = d.ads_library_screenshot_url
          || 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TH&q=' + encodeURIComponent(d.name || '');
    }
    if (d.car === undefined && d.format_distribution) {
      d.car = safeNum(d.format_distribution.carousel);
      d.img = safeNum(d.format_distribution.image);
      d.vid = safeNum(d.format_distribution.video);
    }
    if (d.bundle_score === undefined) d.bundle_score = 0;
    if (d.cta_path === undefined) {
      const ctaTypes = safeArr(d.cta_types);
      const hasLine     = ctaTypes.some(c => /line/i.test(c));
      const hasWebsite  = ctaTypes.some(c => /website|book|travel/i.test(c));
      const hasMsg      = ctaTypes.some(c => /message|messenger/i.test(c));
      if      (!ctaTypes.length || d.ads === 0) d.cta_path = 'no-ads';
      else if (hasLine)    d.cta_path = 'line-messaging';
      else if (hasWebsite) d.cta_path = 'direct-booking';
      else if (hasMsg)     d.cta_path = 'messenger';
      else                 d.cta_path = 'mixed';
    }
    if (d.platform_maturity === undefined) {
      const platforms = safeArr(d.platforms);
      d.platform_maturity = Math.min(platforms.length * 2.5, 10);
      d.platform_label    = platforms.length ? platforms.join(' + ') : 'Organic only';
      d.has_line          = platforms.some(p => /line/i.test(p));
      if (!platforms.length && d.paid_snapshot && d.paid_snapshot.bilingual) {
        d.has_line = true;
      }
    }
    if (d.format_alignment === undefined) {
      const car = safeNum(d.car), img = safeNum(d.img), vid = safeNum(d.vid);
      if      (car >= 80)            { d.format_alignment = 8; d.format_alignment_label = 'Strong alignment'; }
      else if (car >= 50)            { d.format_alignment = 6; d.format_alignment_label = 'Moderate alignment'; }
      else if (img >= 50)            { d.format_alignment = 5; d.format_alignment_label = 'Developing'; }
      else if (vid >= 20)            { d.format_alignment = 7; d.format_alignment_label = 'Strong alignment'; }
      else if (d.ads > 0)            { d.format_alignment = 5; d.format_alignment_label = 'Developing'; }
      else                           { d.format_alignment = 0; }
    }
  });

  // ─────────────────────────────────────────────────────
  // FIX 6 — Build strategic_analysis
  // ─────────────────────────────────────────────────────
  if (!reportData.strategic_analysis) reportData.strategic_analysis = {};
  const SA = reportData.strategic_analysis;

  if (!SA.cta_distribution || !Object.keys(SA.cta_distribution).length) {
    const ctaDist = {};
    safeArr(reportData.deep_dives).forEach(d => {
      const ctaTypes = [...safeArr(d.cta_types)];
      if (!ctaTypes.length && safeNum(d.ads) > 0) {
        const tactic = ((d.paid_snapshot || {}).key_tactic || '').toLowerCase();
        if (tactic.includes('line')) ctaTypes.push('LINE');
        if (tactic.includes('messenger')) ctaTypes.push('Messenger');
        if (tactic.includes('website') || tactic.includes('book')) ctaTypes.push('Website');
      }
      ctaTypes.forEach(cta => {
        const key = String(cta).toLowerCase().replace(/\s+/g, '-');
        if (!key) return;
        if (!ctaDist[key]) ctaDist[key] = { count: 0, competitors: [] };
        if (!ctaDist[key].competitors.includes(d.name)) {
          ctaDist[key].count++;
          ctaDist[key].competitors.push(d.name);
        }
      });
    });
    safeArr(reportData.charts?.ads_cta_types).forEach(ct => {
      const key = String(ct.cta || ct.name || '').toLowerCase().replace(/\s+/g, '-');
      if (!key) return;
      if (!ctaDist[key]) ctaDist[key] = { count: 0, competitors: [] };
      const names = safeArr(ct.names);
      names.forEach(n => {
        if (!ctaDist[key].competitors.includes(n)) {
          ctaDist[key].count++;
          ctaDist[key].competitors.push(n);
        }
      });
      if (!names.length && ct.competitors > 0) {
        ctaDist[key].count = Math.max(ctaDist[key].count, ct.competitors);
      }
    });
    safeArr(reportData.charts?.posts_cta_types).forEach(ct => {
      const key = String(ct.name || ct.cta || '').toLowerCase().replace(/\s+/g, '-');
      if (!key) return;
      if (!ctaDist[key]) ctaDist[key] = { count: 0, competitors: [] };
      ctaDist[key].count = Math.max(ctaDist[key].count, safeNum(ct.competitors || ct.weighted_total));
      safeArr(ct.names).forEach(n => {
        if (!ctaDist[key].competitors.includes(n)) {
          ctaDist[key].competitors.push(n);
        }
      });
    });
    SA.cta_distribution = ctaDist;
  }

  if (!SA.line_adopters_count) {
    const lineUsers = new Set();
    safeArr(reportData.deep_dives).forEach(d => {
      const ctaTypes = safeArr(d.cta_types).map(c => String(c).toLowerCase());
      const tactic = ((d.paid_snapshot || {}).key_tactic || '').toLowerCase();
      const observation = (d.key_observation || '').toLowerCase();
      if (ctaTypes.some(c => c.includes('line')) ||
          d.has_line ||
          tactic.includes('line') ||
          observation.includes('line')) {
        lineUsers.add(d.name);
        d.has_line = true;
      }
    });
    safeArr(reportData.charts?.ads_cta_types).forEach(ct => {
      if (String(ct.cta || ct.name || '').toLowerCase().includes('line')) {
        safeArr(ct.names).forEach(n => lineUsers.add(n));
      }
    });
    let postsLineCount = 0;
    safeArr(reportData.charts?.posts_cta_types).forEach(ct => {
      if (String(ct.name || ct.cta || '').toLowerCase().includes('line')) {
        postsLineCount = Math.max(postsLineCount, safeNum(ct.competitors));
      }
    });
    SA.line_adopters_count = Math.max(lineUsers.size, postsLineCount);
    safeArr(reportData.deep_dives).forEach(d => {
      if (lineUsers.has(d.name)) d.has_line = true;
    });
  }

  if (!SA.seasonal_concentration) {
    const mi = reportData.market_insights || {};
    const zones = safeArr(mi.oversaturated_zones);
    const commonTriggers = ['June', 'July', 'August', 'September', 'Rainy season', 'Workation', 'Solo travel'];
    const allWindowsText = safeArr(reportData.deep_dives)
      .map(d => d.paid_snapshot ? JSON.stringify(d.paid_snapshot.seasonal_windows || []) : '')
      .join(' ');
    const untapped = commonTriggers.filter(t => !allWindowsText.toLowerCase().includes(t.toLowerCase()));
    SA.seasonal_concentration = {
      insight:          zones.join(' • ') || 'Seasonal analysis from market data.',
      untapped_triggers: untapped,
    };
  }
  if (!SA.unexploited_niches || !SA.unexploited_niches.length) {
    const mi = reportData.market_insights || {};
    SA.unexploited_niches = safeArr(mi.segment_gaps).map(gap => ({
      niche:    gap.split(':')[0].trim(),
      evidence: gap,
    }));
  }
  if (!SA.engagement_efficiency || !SA.engagement_efficiency.length) {
    const totalPosts = safeNum(reportData.kpis && reportData.kpis.total_posts, 79);
    SA.engagement_efficiency = safeArr(reportData.charts.post_categories).map(c => {
      const wt = safeNum(c.weighted_total || c.total);
      const eff = wt > 0
        ? safeNum(c.avg_engagement) / Math.max(wt, 1)
        : 0;
      return {
        category:       c.name || c.category,
        posts:          wt,
        pct_of_posts:   Math.round(wt / Math.max(totalPosts, 1) * 100),
        avg_engagement: c.avg_engagement || null,
        efficiency:     Math.round(eff * 100) / 100,
      };
    });
  }

  return reportData;
}
