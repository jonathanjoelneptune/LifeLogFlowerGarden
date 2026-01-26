/* v94_garden.js
 * GitHub Pages friendly GardenExport wiring.
 * Exposes:
 *   window.__LL_GARDEN_EXPORT__
 *   window.ll_loadGardenExport_()
 *   window.ll_getExportRowForDate_(dateKey)
 *   window.ll_getExportWeekForWeekKey_(weekKey)
 *   window.LLGardenExport.ensureLoaded()
 */

(function () {
  'use strict';

  function qp_(k) {
    try { return new URLSearchParams(location.search).get(k) || ''; }
    catch (e) { return ''; }
  }

  function detectBot_() {
    return String(qp_('bot') || window.LL_BOT || 'winston').trim().toLowerCase() || 'winston';
  }

  function detectExecUrl_() {
    const q = String(qp_('exec') || '').trim();
    if (q) return q;
    const w = String(window.LL_EXEC_URL || '').trim();
    if (w) return w;
    const legacy = String(window.EXEC_URL || '').trim();
    if (legacy) return legacy;
    return '';
  }

  function buildUrl_(params) {
    const base = detectExecUrl_();
    if (!base) {
      throw new Error('Missing exec URL. Provide ?exec=... or set window.LL_EXEC_URL in index.html.');
    }
    const u = new URL(base);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return u.toString();
  }

  window.__LL_GARDEN_EXPORT__ = window.__LL_GARDEN_EXPORT__ || {
    loaded: false,
    bot: '',
    byDate: {},
    byWeek: {}
  };

  async function ll_loadGardenExport_() {
    const bot = detectBot_();
    const limit = String(qp_('limit') || '4000').trim() || '4000';
    const url = buildUrl_({ r: 'api_garden_export', bot: bot, limit: limit });

    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();

    let json;
    try { json = JSON.parse(text); }
    catch (e) {
      throw new Error('GardenExport did not return JSON. First 140 chars: ' + text.slice(0, 140));
    }

    if (!json || !json.ok || !Array.isArray(json.rows)) {
      throw new Error('GardenExport JSON invalid or ok=false.');
    }

    const byDate = {};
    const byWeek = {};

    for (let i = 0; i < json.rows.length; i++) {
      const row = json.rows[i] || {};
      const dk = String(row.DateKey || '').slice(0, 10);
      if (dk) byDate[dk] = row;

      const wk = String(row.WeekKey || '').trim();
      if (wk && !byWeek[wk]) {
        byWeek[wk] = {
          WeekLevel: row.WeekLevel || '',
          WeekLevelLabel: row.WeekLevelLabel || ''
        };
      }
    }

    window.__LL_GARDEN_EXPORT__ = {
      loaded: true,
      bot: bot,
      byDate: byDate,
      byWeek: byWeek
    };

    return window.__LL_GARDEN_EXPORT__;
  }

  function ll_getExportRowForDate_(dateKey) {
    const dk = String(dateKey || '').slice(0, 10);
    const st = window.__LL_GARDEN_EXPORT__;
    if (!st || !st.byDate) return null;
    return st.byDate[dk] || null;
  }

  function ll_getExportWeekForWeekKey_(weekKey) {
    const wk = String(weekKey || '').trim();
    const st = window.__LL_GARDEN_EXPORT__;
    if (!st || !st.byWeek) return null;
    return st.byWeek[wk] || null;
  }

  window.ll_loadGardenExport_ = window.ll_loadGardenExport_ || ll_loadGardenExport_;
  window.ll_getExportRowForDate_ = window.ll_getExportRowForDate_ || ll_getExportRowForDate_;
  window.ll_getExportWeekForWeekKey_ = window.ll_getExportWeekForWeekKey_ || ll_getExportWeekForWeekKey_;

  window.LLGardenExport = window.LLGardenExport || {
    ensureLoaded: async function () {
      if (window.__LL_GARDEN_EXPORT__ && window.__LL_GARDEN_EXPORT__.loaded) return window.__LL_GARDEN_EXPORT__;
      return await window.ll_loadGardenExport_();
    },
    getRow: function (dateKey) { return window.ll_getExportRowForDate_(dateKey); },
    getWeek: function (weekKey) { return window.ll_getExportWeekForWeekKey_(weekKey); },
    getExecUrl: function () { return detectExecUrl_(); },
    getBot: function () { return detectBot_(); }
  };

  if (!window.LL_NO_AUTOLOAD) {
    document.addEventListener('DOMContentLoaded', function () {
      window.LLGardenExport.ensureLoaded().catch(function () {});
    }, { passive: true });
  }
})();
